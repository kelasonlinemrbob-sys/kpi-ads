"use server";

import bcrypt from "bcryptjs";
import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { advertiserLevelEnum, kpiMetrics, kpiTargets, roleEnum, users } from "@/db/schema";
import { createSession, requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/data";
import { isPeriod } from "@/lib/kpi";
import { DEFAULT_SECONDARY_SHARE } from "@/lib/member-roles";
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
  email: z.email("Enter a valid email").transform((s) => s.toLowerCase().trim()),
  role: z.enum(roleEnum.enumValues),
  advertiserLevel: z.enum(advertiserLevelEnum.enumValues).optional(),
  secondaryRole: z.enum(roleEnum.enumValues).optional().or(z.literal("none").transform(() => undefined)),
  secondaryShare: z.coerce.number().int().min(10, "Porsi role kedua minimal 10%.").max(90, "Porsi role kedua maksimal 90%.").optional(),
  title: z.string().trim().max(120).optional(),
  password: z.string().min(8, "Password must be at least 8 characters").optional().or(z.literal("").transform(() => undefined)),
  isActive: z.enum(["on"]).optional(),
});

export async function saveMember(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireSupervisor();
  const raw = Object.fromEntries([...formData.entries()].filter(([k, v]) => !(k === "id" && v === "")));
  const parsed = memberSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { id, password, isActive, advertiserLevel, secondaryRole, secondaryShare, ...rest } = parsed.data;
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

  if (id) {
    if (id === me.id && (data.role !== "supervisor" || !isActive)) {
      return { error: "You can't remove your own supervisor access." };
    }
    await db
      .update(users)
      .set({
        ...data,
        title: data.title || null,
        isActive: !!isActive,
        // A password reset or deactivation ends the member's open sessions.
        ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
        ...(password || !isActive ? { sessionVersion: sql`${users.sessionVersion} + 1` } : {}),
      })
      .where(eq(users.id, id));
    // A supervisor resetting their own password stays signed in on this device.
    if (id === me.id && password) {
      const [self] = await db.select({ sessionVersion: users.sessionVersion }).from(users).where(eq(users.id, id));
      await createSession(id, self!.sessionVersion);
    }
  } else {
    if (!password) return { error: "Set an initial password for the new member." };
    const [created] = await db
      .insert(users)
      .values({ ...data, title: data.title || null, passwordHash: await bcrypt.hash(password, 10) })
      .returning({ id: users.id });
    await logActivity({
      actorId: me.id,
      subjectUserId: created!.id,
      type: "user_created",
      title: "New Team Member",
      description: `${data.name} joined as ${roleLabel(data.role, data.advertiserLevel)}${data.secondaryRole ? ` + ${ROLE_LABEL[data.secondaryRole]}` : ""}`,
      href: "/team",
    });
  }
  revalidatePath("/", "layout");
  return { ok: true, message: id ? "Member updated" : "Member added" };
}

export async function setMemberActive(id: number, active: boolean) {
  const me = await requireSupervisor();
  if (id === me.id) return { error: "You can't deactivate yourself." };
  await db.update(users).set({ isActive: active }).where(eq(users.id, id));
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
  const num = (v: FormDataEntryValue | null) => {
    const s = String(v ?? "").trim();
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? n : NaN;
  };

  let totalWeight = 0;
  const metricUpdates: { id: number; defaultTarget: number | null; weight: number }[] = [];
  for (const m of metrics) {
    const def = num(formData.get(`default_${m.id}`));
    const weight = num(formData.get(`weight_${m.id}`)) ?? 0;
    if (Number.isNaN(def) || Number.isNaN(weight)) return { error: `Invalid number for ${m.name}.` };
    totalWeight += weight;
    metricUpdates.push({ id: m.id, defaultTarget: def, weight: Math.round(weight) });
  }
  if (totalWeight <= 0) return { error: "At least one KPI needs a weight above 0." };

  const overrides: { userId: number; metricId: number; target: number | null }[] = [];
  for (const [key, value] of formData.entries()) {
    const m = /^target_(\d+)_(\d+)$/.exec(key);
    if (!m) continue;
    const target = num(value);
    if (Number.isNaN(target)) return { error: "Targets must be positive numbers." };
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
