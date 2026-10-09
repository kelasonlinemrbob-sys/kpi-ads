import "server-only";
import { randomBytes } from "node:crypto";
import { Resolver } from "node:dns/promises";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { orderFormDomains, orderForms } from "@/db/schema";
import { formDomainDnsError, normalizeFormDomain, sameRequestOrigin } from "./form-domain-input";

type DomainDb = Pick<typeof db, "select" | "insert" | "update">;
type Actor = { id: number; role: string };
export class FormDomainError extends Error {}
export const applicationOrigin = () => new URL(process.env.APP_URL || "http://localhost:3000").origin;
export function domainTargetIp() { return process.env.FORM_DOMAIN_TARGET_IP?.trim() || ""; }

async function ownedForm(tx: DomainDb, actor: Actor, formId: number) {
  if (!["supervisor", "advertiser"].includes(actor.role) || !Number.isSafeInteger(formId) || formId <= 0) throw new FormDomainError("Tidak memiliki akses mengatur domain form.");
  const [form] = await tx.select().from(orderForms).where(eq(orderForms.id, formId)).for("update");
  if (!form || form.deletedAt || (actor.role !== "supervisor" && form.ownerId !== actor.id)) throw new FormDomainError("Form tidak ditemukan.");
  return form;
}

export async function getFormDomain(formId: number, tx: DomainDb = db) {
  const [row] = await tx.select().from(orderFormDomains).where(eq(orderFormDomains.formId, formId));
  return row ?? null;
}

export async function connectFormDomain(tx: DomainDb, actor: Actor, formId: number, input: string) {
  await ownedForm(tx, actor, formId);
  let hostname: string;
  try { hostname = normalizeFormDomain(input, new URL(applicationOrigin()).hostname); }
  catch (error) { throw new FormDomainError((error as Error).message); }
  if (!domainTargetIp()) throw new FormDomainError("Layanan custom domain belum diaktifkan di server.");
  const current = await getFormDomain(formId, tx);
  if (current) {
    if (current.hostname === hostname && current.status !== "removing") return current;
    throw new FormDomainError("Lepas domain lama dan tunggu sampai selesai sebelum menggantinya.");
  }
  const [saved] = await tx.insert(orderFormDomains).values({ formId, hostname, verificationToken: randomBytes(24).toString("hex") })
    .onConflictDoNothing().returning();
  if (!saved) throw new FormDomainError("Domain sudah terhubung ke form lain.");
  return saved;
}

export async function removeFormDomain(tx: DomainDb, actor: Actor, formId: number) {
  await ownedForm(tx, actor, formId);
  await tx.update(orderFormDomains).set({ status: "removing", error: null, updatedAt: new Date() }).where(eq(orderFormDomains.formId, formId));
}

export async function inspectFormDomainDns(hostname: string, token: string) {
  const resolver = new Resolver({ timeout: 3000, tries: 1 });
  try {
    const optional = async <T>(run: Promise<T>, empty: T): Promise<T> => {
      try { return await run; } catch (error) {
        if (["ENODATA", "ENOTFOUND"].includes((error as NodeJS.ErrnoException).code ?? "")) return empty;
        throw error;
      }
    };
    const [addresses, ipv6, records] = await Promise.all([
      optional(resolver.resolve4(hostname), []), optional(resolver.resolve6(hostname), []),
      optional(resolver.resolveTxt(`_kpiads.${hostname}`), []),
    ]);
    return formDomainDnsError(addresses, ipv6, records, domainTargetIp(), token);
  } catch { return "DNS belum dapat diperiksa. Tunggu propagasi lalu coba lagi."; }
  finally { resolver.cancel(); }
}

export async function checkFormDomain(actor: Actor, formId: number) {
  const current = await db.transaction(async tx => { await ownedForm(tx, actor, formId); return getFormDomain(formId, tx); });
  if (!current) throw new FormDomainError("Simpan custom domain terlebih dahulu.");
  if (["active", "removing"].includes(current.status)) return current;
  if (current.checkedAt && Date.now() - current.checkedAt.getTime() < 10_000) return current;
  const error = await inspectFormDomainDns(current.hostname, current.verificationToken);
  // Do not undo a concurrent disconnect or TLS activation while DNS was resolving.
  const [updated] = await db.update(orderFormDomains).set({ status: error ? "pending_dns" : "pending_tls", error, checkedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(orderFormDomains.id, current.id), eq(orderFormDomains.updatedAt, current.updatedAt))).returning();
  return updated ?? getFormDomain(formId);
}

export async function activeDomainForSlug(hostname: string, slug: string, tx: DomainDb = db) {
  const [row] = await tx.select({ hostname: orderFormDomains.hostname }).from(orderFormDomains)
    .innerJoin(orderForms, eq(orderForms.id, orderFormDomains.formId))
    .where(and(eq(orderFormDomains.hostname, hostname), eq(orderFormDomains.status, "active"), eq(orderForms.slug, slug), isNull(orderForms.deletedAt)));
  return !!row;
}

export async function allowedFormOrigin(origin: string | null, host: string | null, slug: string, tx: DomainDb = db) {
  if (!sameRequestOrigin(origin, host)) return false;
  if (origin === applicationOrigin()) return true;
  // Custom form domains serve only HTTPS; each must be active and match this form.
  if (!origin?.startsWith("https://") || !host) return false;
  return activeDomainForSlug(host.toLowerCase(), slug, tx);
}
