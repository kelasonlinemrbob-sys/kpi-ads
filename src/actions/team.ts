"use server";

import { normalizePhone } from "@/lib/order-form-input";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { deliverMemberInvitation, InvitationError, invitationErrorMessage, issueMemberInvitation } from "@/lib/member-invitations";
import { resetMailConfig } from "@/lib/reset-mail";
import { takeResetQuota } from "@/lib/password-reset";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { advertiserLevelEnum, creativeAdvertisers, kpiMetrics, kpiTargets, roleEnum, users } from "@/db/schema";
import { createSession, requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/data";
import { isPeriod, periodRange } from "@/lib/kpi";
import { parseMemberTargets } from "@/lib/member-targets";
import { writeMemberTargets } from "@/lib/member-target-store";
import { validTarget } from "@/lib/target-rules";
import { DEFAULT_SECONDARY_SHARE, hasRole, isTracked } from "@/lib/member-roles";
import { ROLE_LABEL, roleLabel } from "@/lib/roles";
import type { FormState } from "./auth";

async function requireSupervisor() {
  const user = await requireUser();
  if (user.role !== "supervisor") throw new Error("Forbidden");
  return user;
}

const memberSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(2, "Name is too short").max(120),
  email: z.email("Enter a valid email").max(180).transform((s) => s.toLowerCase().trim()),
  role: z.enum(roleEnum.enumValues),
  advertiserLevel: z.enum(advertiserLevelEnum.enumValues).optional(),
  secondaryRole: z.enum(roleEnum.enumValues).optional().or(z.literal("none").transform(() => undefined)),
  secondaryShare: z.coerce.number().int().min(10, "Porsi role kedua minimal 10%.").max(90, "Porsi role kedua maksimal 90%.").optional(),
  title: z.string().trim().max(120).optional(),
  csoPhone: z.string().trim().max(30).optional(),
  password: z.string().min(8, "Password must be at least 8 characters").optional().or(z.literal("").transform(() => undefined)),
  isActive: z.enum(["on"]).optional(),
});

export async function saveMember(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireSupervisor();
  const raw = Object.fromEntries([...formData.entries()].filter(([k, v]) => !(k === "id" && v === "")));
  const parsed = memberSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { id, password, isActive, advertiserLevel, secondaryRole, secondaryShare, ...rest } = parsed.data;
  if (secondaryRole === "cso" || (rest.role === "cso" && secondaryRole)) return { error: "CSO menggunakan role utama tanpa role rangkap." };
  if (secondaryRole === "creative" || (rest.role === "creative" && secondaryRole)) return { error: "Creative tidak memakai KPI, jadi tidak bisa menjadi atau memiliki role rangkap." };
  // Creative: the advertisers they work for (none = the whole team).
  const linkedIds = rest.role === "creative" ? [...new Set(formData.getAll("linkedAdvertiserIds").map(Number))] : [];
  if (linkedIds.some((n) => !Number.isSafeInteger(n) || n <= 0)) return { error: "Pilihan advertiser tidak valid." };
  if (linkedIds.length) {
    const found = await db.select({ id: users.id }).from(users).where(and(inArray(users.id, linkedIds), inArray(users.role, ["advertiser", "supervisor"])));
    if (found.length !== linkedIds.length) return { error: "Advertiser yang dipilih tidak ditemukan." };
  }
  if (rest.role === "cso") {
    try { rest.csoPhone = normalizePhone(rest.csoPhone ?? ""); } catch { return { error: "Isi nomor WhatsApp CSO yang valid." }; }
  } else { rest.csoPhone = undefined; }
  if (secondaryRole) {
    if (rest.role === "supervisor" || secondaryRole === "supervisor") return { error: "Supervisor tidak bisa merangkap role lain." };
    if (secondaryRole === rest.role) return { error: "Role kedua harus berbeda dari role utama." };
    // Ads features (campaigns, Generate dari Ads, WhatsApp) follow the main role.
    if (secondaryRole === "advertiser") return { error: "Jadikan Advertiser sebagai role utama, lalu pilih role kedua." };
  }
  // Seniority only means something for advertisers.
  const data = {
    ...rest,
    advertiserLevel: rest.role === "advertiser" ? (advertiserLevel ?? "junior") : null,
    secondaryRole: secondaryRole ?? null,
    secondaryShare: secondaryShare ?? DEFAULT_SECONDARY_SHARE,
  };

  const [clash] = await db
    .select({ id: users.id })
    .from(users)
    .where(id ? and(eq(users.email, data.email), ne(users.id, id)) : eq(users.email, data.email))
    .limit(1);
  if (clash) return { error: "Another account already uses this email." };

  if (id === me.id && (data.role !== "supervisor" || !isActive)) return { error: "You can't remove your own supervisor access." };
  if (!id && password) return { error: "Member baru membuat password sendiri melalui undangan email." };
  const [before] = id ? await db.select().from(users).where(eq(users.id, id)) : [];
  if (id && !before) return { error: "Anggota tidak ditemukan." };
  const needsInvitation = !id || (before?.invitationPending && before.email !== data.email);
  if (needsInvitation) {
    try { resetMailConfig(); } catch { return { error: "Layanan email belum tersedia. Periksa konfigurasi SMTP server." }; }
    if (!await takeResetQuota(db, `invitation:sender:${me.id}`, 20)) return { error: "Batas pengiriman undangan tercapai. Coba lagi dalam 15 menit." };
  }
  let targetInput: ReturnType<typeof parseMemberTargets> | undefined;
  if (formData.has("targetPeriod") && isTracked(data)) {
    try { targetInput = parseMemberTargets(formData, await db.select().from(kpiMetrics), data); }
    catch (error) { return { error: (error as Error).message }; }
  }
  const passwordHash = password || !id ? await bcrypt.hash(password || randomBytes(32).toString("hex"), 10) : undefined;
  let saved: { userId: number; issued?: Awaited<ReturnType<typeof issueMemberInvitation>> } | null;
  try {
    saved = await db.transaction(async (tx) => {
      let userId = id;
      let invite = !id;
      if (userId) {
        const [current] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
        if (!current) return null;
        if (formData.get("editingInvitation") === "on" && !current.invitationPending) throw new InvitationError("Anggota sudah bergabung. Muat ulang sebelum mengedit akun.");
        if (current.invitationPending && password) throw new InvitationError("Password member undangan harus dibuat sendiri oleh penerima.");
        invite = current.invitationPending && current.email !== data.email;
        await tx.update(users).set({
          ...data, title: data.title || null, isActive: current.invitationPending ? false : !!isActive,
          ...(passwordHash ? { passwordHash } : {}),
          ...(password || !isActive ? { sessionVersion: sql`${users.sessionVersion} + 1` } : {}),
        }).where(eq(users.id, userId));
      } else {
        const [created] = await tx.insert(users).values({ ...data, title: data.title || null, isActive: false, invitationPending: true, passwordHash: passwordHash! }).returning({ id: users.id });
        userId = created.id;
      }
      if (targetInput) await writeMemberTargets(tx, userId, targetInput);
      await tx.delete(creativeAdvertisers).where(eq(creativeAdvertisers.creativeId, userId));
      const links = linkedIds.filter((a) => a !== userId).map((advertiserId) => ({ creativeId: userId!, advertiserId }));
      if (links.length) await tx.insert(creativeAdvertisers).values(links);
      const issued = invite ? await issueMemberInvitation(tx, userId, me.id, new Date(), !!id) : undefined;
      return { userId, issued };
    });
  } catch (error) {
    const code = (error as { code?: string; cause?: { code?: string } });
    if (code.code === "23505" || code.cause?.code === "23505") return { error: "Email sudah digunakan oleh anggota lain." };
    return { error: invitationErrorMessage(error) };
  }
  if (!saved) return { error: "Anggota tidak ditemukan." };
  const savedId = saved.userId;
  if (id === me.id && password) {
    const [self] = await db.select({ sessionVersion: users.sessionVersion }).from(users).where(eq(users.id, id));
    await createSession(id, self!.sessionVersion);
  }
  let delivered = true;
  if (saved.issued) {
    try { delivered = await deliverMemberInvitation(saved.issued, me.name); } catch { delivered = false; }
  }
  await logActivity({ actorId: me.id, subjectUserId: savedId, type: id ? "target_updated" : "user_created",
    title: id ? "Member Updated" : "New Team Member",
    description: `${data.name} · ${roleLabel(data.role, data.advertiserLevel)}${targetInput ? ` · target ${targetInput.period}` : ""}`,
    href: `/targets?user=${savedId}${targetInput ? `&period=${targetInput.period}` : ""}` });
  revalidatePath("/", "layout");
  if (!delivered) return { ok: true, warning: "Anggota dan target KPI tersimpan, tetapi email undangan belum berhasil dikirim. Gunakan Kirim ulang undangan di tabel anggota." };
  return { ok: true, message: saved.issued ? "Undangan email dikirim. Member akan membuat password sendiri." : "Member updated" };
}

export async function setMemberActive(id: number, active: boolean) {
  const me = await requireSupervisor();
  if (id === me.id) return { error: "You can't deactivate yourself." };
  if (!Number.isSafeInteger(id) || id <= 0 || typeof active !== "boolean") return { error: "Data anggota tidak valid." };
  const [updated] = await db.update(users).set({ isActive: active, ...(!active ? { sessionVersion: sql`${users.sessionVersion} + 1` } : {}) }).where(and(eq(users.id, id), eq(users.invitationPending, false))).returning({ id: users.id });
  if (!updated) return { error: "Anggota belum bergabung. Kirim ulang undangan agar ia dapat membuat password." };
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Saves the targets grid for one role and month.
 * Fields: `default_<metricId>`, `weight_<metricId>` and `target_<userId>_<metricId>` (empty = use default).
 */
export async function saveTargets(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireSupervisor();
  const period = String(formData.get("period"));
  const role = String(formData.get("role"));
  if (!isPeriod(period)) return { error: "Invalid period." };
  if (!roleEnum.enumValues.includes(role as never)) return { error: "Invalid role." };

  const metrics = await db.select().from(kpiMetrics).where(eq(kpiMetrics.role, role as (typeof roleEnum.enumValues)[number]));
  const chatCadence = String(formData.get("chatCadence") ?? "monthly");
  if (!["daily", "monthly"].includes(chatCadence)) return { error: "Periode target chat tidak valid." };
  const normalize = (key: string, value: number | null) => value !== null && key === "leads" && chatCadence === "daily" ? value * periodRange(period).days : value;
  const members = await db.select({ id: users.id, role: users.role, secondaryRole: users.secondaryRole }).from(users).where(eq(users.isActive, true));
  const num = (v: FormDataEntryValue | null) => {
    const s = String(v ?? "").trim();
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? n : NaN;
  };

  let totalWeight = 0;
  const metricUpdates: { id: number; defaultTarget: number | null; weight: number }[] = [];
  for (const m of metrics) {
    const def = normalize(m.key, num(formData.get(`default_${m.id}`)));
    const weight = num(formData.get(`weight_${m.id}`)) ?? 0;
    if (Number.isNaN(def) || Number.isNaN(weight)) return { error: `Invalid number for ${m.name}.` };
    if (!validTarget(m.key, def, true)) return { error: `Target ${m.name} tidak memenuhi batas minimum / maksimum.` };
    if (weight < 0 || weight > 100 || !Number.isInteger(weight)) return { error: "Bobot harus berupa bilangan bulat 0–100." };
    totalWeight += weight;
    metricUpdates.push({ id: m.id, defaultTarget: def, weight: Math.round(weight) });
  }
  if (totalWeight <= 0) return { error: "At least one KPI needs a weight above 0." };

  const overrides: { userId: number; metricId: number; target: number | null }[] = [];
  for (const [key, value] of formData.entries()) {
    const m = /^target_(\d+)_(\d+)$/.exec(key);
    if (!m) continue;
    const metric = metrics.find((metric) => metric.id === Number(m[2]));
    const member = members.find((member) => member.id === Number(m[1]));
    if (!metric || !member || !hasRole(member, metric.role)) return { error: "Anggota atau KPI tidak sesuai role." };
    const target = normalize(metric.key, num(value));
    if (Number.isNaN(target)) return { error: "Targets must be positive numbers." };
    if (!validTarget(metric.key, target)) return { error: `Target ${metric.name} tidak memenuhi batas minimum / maksimum.` };
    overrides.push({ userId: Number(m[1]), metricId: Number(m[2]), target });
  }

  await db.transaction(async (tx) => {
    for (const u of metricUpdates) {
      await tx.update(kpiMetrics).set({ defaultTarget: u.defaultTarget, weight: u.weight }).where(eq(kpiMetrics.id, u.id));
    }
    for (const o of overrides) {
      const where = and(eq(kpiTargets.userId, o.userId), eq(kpiTargets.metricId, o.metricId), eq(kpiTargets.period, period));
      if (o.target === null) {
        await tx.delete(kpiTargets).where(where);
      } else {
        await tx
          .insert(kpiTargets)
          .values({ userId: o.userId, metricId: o.metricId, period, target: o.target })
          .onConflictDoUpdate({
            target: [kpiTargets.userId, kpiTargets.metricId, kpiTargets.period],
            set: { target: o.target, updatedAt: new Date() },
          });
      }
    }
  });

  await logActivity({
    actorId: me.id,
    type: "target_updated",
    title: "KPI Targets Updated",
    description: `${ROLE_LABEL[role as keyof typeof ROLE_LABEL]} targets for ${period}`,
    href: `/targets?period=${period}&role=${role}`,
  });
  revalidatePath("/", "layout");
  return { ok: true, message: totalWeight === 100 ? "Targets saved" : `Targets saved (weights total ${totalWeight}%, scores are normalised)` };
}

/** One member and one month; role defaults and other members are never modified. */
export async function saveMemberTargets(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireSupervisor();
  const id = Number(formData.get("userId"));
  if (!Number.isSafeInteger(id) || id <= 0) return { error: "Pilih anggota yang valid." };
  const result = await db.transaction(async (tx) => {
    const [member] = await tx.select().from(users).where(eq(users.id, id)).for("update");
    if (!member) return { error: "Anggota tidak ditemukan." };
    let input: ReturnType<typeof parseMemberTargets>;
    try { input = parseMemberTargets(formData, await tx.select().from(kpiMetrics), member); }
    catch (error) { return { error: (error as Error).message }; }
    if (!input.values.length) return { error: "Isi minimal satu target untuk disimpan." };
    await writeMemberTargets(tx, id, input);
    return { period: input.period, name: member.name };
  });
  if ("error" in result) return result;
  await logActivity({ actorId: me.id, subjectUserId: id, type: "target_updated", title: "Target Bulanan Anggota", description: `${result.name} · ${result.period}`, href: `/targets?user=${id}&period=${result.period}` });
  revalidatePath("/", "layout");
  return { ok: true, message: `Target ${result.name} untuk ${result.period} disimpan.` };
}
