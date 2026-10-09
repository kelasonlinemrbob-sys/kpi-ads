import "server-only";
import { and, eq, like, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { appSettings, users, type Role } from "@/db/schema";
import { canViewSeo } from "./roles";
import { decryptSecret, encryptSecret } from "./secret-box";
import { createSearchConsoleClient, searchConsoleSite, SearchConsoleError, type SearchConsoleSite } from "./search-console-client";
import { mergeSearchConsoleCredentials, searchConsoleInput, searchConsoleRange, searchConsoleToday, shiftSearchDate, withoutOverlaps } from "./search-console-input";

const KEY = "shared.search_console.connection";
const storedSchema = z.object({
  credentials: searchConsoleInput.omit({ siteUrl: true }).extend({ clientSecret: z.string().min(1), refreshToken: z.string().min(1) }),
  sites: z.array(searchConsoleSite), siteUrl: z.string().min(1), checkedAt: z.string(),
});
async function readConnection() {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, KEY));
  if (!row) return { stored: null, value: null, error: null };
  try {
    const data = JSON.parse(decryptSecret(row.value) ?? "null");
    if (data?.disabled === true) return { stored: null, value: row.value, error: null };
    return { stored: storedSchema.parse(data), value: row.value, error: null };
  } catch {
    return { stored: null, value: row.value, error: "Konfigurasi Search Console tidak dapat dibaca. Supervisor perlu mengisi ulang kredensial." };
  }
}
export async function getSearchConsoleStatus() {
  const { stored, error } = await readConnection();
  return {
    connected: !!stored, error, clientId: stored?.credentials.clientId ?? "",
    hasClientSecret: !!stored?.credentials.clientSecret, hasRefreshToken: !!stored?.credentials.refreshToken,
    sites: stored?.sites ?? [], siteUrl: stored?.siteUrl ?? "", checkedAt: stored?.checkedAt ?? null,
  };
}
export type SearchConsoleStatus = Awaited<ReturnType<typeof getSearchConsoleStatus>>;
export async function getSearchConsoleMemberStatus() {
  const { stored, error } = await readConnection();
  return { connected: !!stored, error: error ? "Koneksi Search Console perlu diperiksa supervisor." : null };
}
type Viewer = { id: number; role: Role; secondaryRole?: Role | null };
const selectionSchema = z.array(z.string().min(1).max(2048)).max(1000);
const selectionKey = (userId: number) => `user.${userId}.search_console.sites`;
function authorizeViewer(user: Viewer) {
  if (!canViewSeo(user)) throw new SearchConsoleError("Anda tidak memiliki akses Search Console.");
}
async function selectedSites(userId: number) {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, selectionKey(userId)));
  if (!row) return [];
  try { return selectionSchema.parse(JSON.parse(row.value)); }
  catch { throw new SearchConsoleError("Pilihan website tidak dapat dibaca. Hubungi supervisor."); }
}
export type SearchConsoleWebsiteChoice = {
  siteUrl: string;
  selected: boolean;
  available: boolean;
  /** "Domain" (sc-domain:) or "URL" property; the permission the team's Google account has on it. */
  kind: "domain" | "url";
  permission: SearchConsoleSite["permissionLevel"] | null;
  /** Other members who picked it: a website can be shared, unlike an ad account. */
  usedBy: string[];
};
/** Names of the other active members who picked each website. */
async function sitePickers(exceptUserId: number) {
  const rows = await db.select({ key: appSettings.key, value: appSettings.value, name: users.name, isActive: users.isActive })
    .from(appSettings).innerJoin(users, sql`${appSettings.key} = 'user.' || ${users.id} || '.search_console.sites'`)
    .where(like(appSettings.key, "user.%.search_console.sites"));
  const byUrl = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.isActive || row.key === selectionKey(exceptUserId)) continue;
    let urls: string[] = [];
    try { urls = selectionSchema.parse(JSON.parse(row.value)); } catch { continue; }
    for (const url of urls) byUrl.set(url, [...(byUrl.get(url) ?? []), row.name]);
  }
  return byUrl;
}
/** Only website names, this user's selection and teammates' names reach the member's browser. */
export async function listSearchConsoleWebsiteChoices(user: Viewer): Promise<SearchConsoleWebsiteChoice[]> {
  authorizeViewer(user);
  const [current, selected, pickers] = await Promise.all([readConnection(), selectedSites(user.id), sitePickers(user.id)]);
  if (current.error) throw new SearchConsoleError("Koneksi Search Console perlu diperiksa supervisor.");
  const sites = current.stored ? await (await createSearchConsoleClient(current.stored.credentials)).listSites() : [];
  const available = new Map(sites.map((site) => [site.siteUrl, site.permissionLevel]));
  return [...new Set([...available.keys(), ...selected])].sort().map((siteUrl) => ({
    siteUrl, selected: selected.includes(siteUrl), available: available.has(siteUrl),
    kind: siteUrl.startsWith("sc-domain:") ? "domain" : "url", permission: available.get(siteUrl) ?? null, usedBy: pickers.get(siteUrl) ?? [],
  }));
}
/** Picks or releases one website (Settings → Integrasi, like picking an ad account); the rest stays as is. */
export async function toggleSearchConsoleWebsite(user: Viewer, siteUrl: string, pick: boolean) {
  authorizeViewer(user);
  if (typeof siteUrl !== "string" || !siteUrl || siteUrl.length > 2048) throw new SearchConsoleError("Website tidak valid.");
  const current = await selectedSites(user.id);
  const next = pick ? [...new Set([...current, siteUrl])] : current.filter((url) => url !== siteUrl);
  // Releasing never needs Google; picking checks the team connection can still read the website.
  if (!pick) {
    const value = JSON.stringify(next);
    await db.insert(appSettings).values({ key: selectionKey(user.id), value, updatedById: user.id }).onConflictDoUpdate({ target: appSettings.key, set: { value, updatedById: user.id, updatedAt: new Date() } });
    return next;
  }
  return saveSearchConsoleWebsites(user, next);
}
export async function saveSearchConsoleWebsites(user: Viewer, input: unknown) {
  authorizeViewer(user);
  const parsed = selectionSchema.safeParse(input);
  if (!parsed.success) throw new SearchConsoleError("Daftar website tidak valid.");
  const urls = [...new Set(parsed.data)];
  // A user can always clear their selection, including after disconnection or revoked Google access.
  if (urls.length) {
    const current = await readConnection();
    if (!current.stored) throw new SearchConsoleError("Koneksi Search Console tim belum tersedia. Hubungi supervisor.");
    const sites = await (await createSearchConsoleClient(current.stored.credentials)).listSites();
    if (urls.some((url) => !sites.some((site) => site.siteUrl === url))) throw new SearchConsoleError("Sebagian website tidak lagi tersedia dari koneksi tim. Muat ulang daftar lalu pilih kembali.");
  }
  const value = JSON.stringify(urls);
  await db.insert(appSettings).values({ key: selectionKey(user.id), value, updatedById: user.id }).onConflictDoUpdate({ target: appSettings.key, set: { value, updatedById: user.id, updatedAt: new Date() } });
  return urls;
}
export function searchConsoleErrorMessage(error: unknown) {
  return error instanceof SearchConsoleError ? error.message : "Search Console belum dapat diproses. Periksa konfigurasi server dan coba lagi.";
}
export async function saveSearchConsole(input: unknown, actorId: number) {
  const parsed = searchConsoleInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Form tidak valid." };
  try {
    const current = await readConnection();
    let credentials;
    try { credentials = mergeSearchConsoleCredentials(parsed.data, current.stored?.credentials ?? null); }
    catch (error) { return { ok: false as const, error: (error as Error).message }; }
    const client = await createSearchConsoleClient(credentials);
    const sites = await client.listSites();
    if (!sites.length) throw new SearchConsoleError("Akun Google belum memiliki properti Search Console yang terverifikasi. Tambahkan akses properti terlebih dahulu.");
    const siteUrl = parsed.data.siteUrl || sites[0].siteUrl;
    if (!sites.some((site) => site.siteUrl === siteUrl)) throw new SearchConsoleError("Properti tidak tersedia untuk akun Google ini. Pilih properti yang dapat diakses atau kosongkan untuk memilih otomatis.");
    await client.query(siteUrl, searchConsoleRange({}));
    const value = encryptSecret(JSON.stringify({ credentials, sites, siteUrl, checkedAt: new Date().toISOString() }));
    // Do not resurrect a disconnected connection or overwrite another supervisor's save while Google was responding.
    const saved = current.value === null
      ? await db.insert(appSettings).values({ key: KEY, value, updatedById: actorId }).onConflictDoNothing().returning({ key: appSettings.key })
      : await db.update(appSettings).set({ value, updatedById: actorId, updatedAt: new Date() }).where(and(eq(appSettings.key, KEY), eq(appSettings.value, current.value))).returning({ key: appSettings.key });
    if (!saved.length) throw new SearchConsoleError("Koneksi berubah saat tes berlangsung. Muat ulang halaman dan coba lagi.");
    return { ok: true as const, siteUrl };
  } catch (error) { return { ok: false as const, error: searchConsoleErrorMessage(error) }; }
}
export async function disconnectSearchConsole(actorId: number) {
  const value = encryptSecret(JSON.stringify({ disabled: true }));
  await db.insert(appSettings).values({ key: KEY, value, updatedById: actorId }).onConflictDoUpdate({ target: appSettings.key, set: { value, updatedById: actorId, updatedAt: new Date() } });
}
/** The viewer must be the authenticated user; a URL parameter never grants property access. */
export async function loadSearchConsoleReport(user: Viewer, site: string | undefined, range: { start: string; end: string }) {
  authorizeViewer(user);
  const selected = user.role === "supervisor" ? null : await selectedSites(user.id);
  if (site && selected && !selected.includes(site)) throw new SearchConsoleError("Website ini belum Anda pilih. Pilih website Anda di Pengaturan → Integrasi → Google Search Console.");
  const { stored, error } = await readConnection();
  if (error) throw new SearchConsoleError(error);
  if (!stored) return null;
  if (selected?.length === 0) return { sites: [], siteUrl: null, report: null };
  const client = await createSearchConsoleClient(stored.credentials);
  const accessible = await client.listSites();
  const sites = selected ? accessible.filter((s) => selected.includes(s.siteUrl)) : accessible;
  const siteUrl = site || (sites.some((s) => s.siteUrl === stored.siteUrl) ? stored.siteUrl : sites[0]?.siteUrl);
  if (!siteUrl || !sites.some((s) => s.siteUrl === siteUrl)) throw new SearchConsoleError("Properti tidak tersedia atau akses telah dicabut. Pilih properti lain atau tes ulang koneksi di Pengaturan.");
  return { sites, siteUrl, report: await client.report(siteUrl, range) };
}
/** Whether this viewer may see a property: supervisors any property of the team connection, others the ones they picked. */
export async function viewerCanSeeSite(user: Viewer, siteUrl: string) {
  if (!canViewSeo(user)) return false;
  if (user.role === "supervisor") return true;
  try { return (await selectedSites(user.id)).includes(siteUrl); } catch { return false; }
}

export type SeoReportSite = { siteUrl: string; clicks: number; impressions: number; ctr: number; position: number | null; top10: number };
export type SeoReportFigures = { date: string; sites: SeoReportSite[]; clicks: number; impressions: number; top10: number; final: boolean; skipped: string[] };

/**
 * Search Console figures for one daily SEO report: clicks, impressions and keywords in the top 10 on that
 * date, for each website the member picked (supervisors: every team website), summed. Includes Google's
 * fresh data, so the last 2–3 days can still grow; `final` says whether the date is settled.
 */
export async function seoReportFigures(user: Viewer, date: string): Promise<SeoReportFigures> {
  authorizeViewer(user);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new SearchConsoleError("Tanggal tidak valid.");
  const today = searchConsoleToday();
  if (date > today) throw new SearchConsoleError("Data Search Console untuk tanggal ini belum ada (Google memakai zona waktu Pacific, 14 jam di belakang WIB). Coba lagi nanti atau pilih tanggal kemarin.");
  const { stored, error } = await readConnection();
  if (error) throw new SearchConsoleError(error);
  if (!stored) throw new SearchConsoleError("Koneksi Search Console tim belum diisi supervisor.");
  const client = await createSearchConsoleClient(stored.credentials);
  const accessible = (await client.listSites()).map((s) => s.siteUrl);
  const picked = user.role === "supervisor" ? accessible : (await selectedSites(user.id)).filter((url) => accessible.includes(url));
  if (!picked.length) throw new SearchConsoleError("Belum ada website yang Anda pilih. Pilih di menu SEO → Website saya.");
  const range = { start: date, end: date };
  // URL properties inside a picked domain property are already in its figures.
  const counted = withoutOverlaps(picked);
  const sites = await Promise.all(counted.slice(0, 20).map(async (siteUrl): Promise<SeoReportSite> => {
    const [total, keywords] = await Promise.all([
      client.query(siteUrl, range, undefined, { fresh: true }),
      client.query(siteUrl, range, "query", { fresh: true, rowLimit: 5000 }),
    ]);
    const t = total[0];
    return { siteUrl, clicks: t?.clicks ?? 0, impressions: t?.impressions ?? 0, ctr: t?.ctr ?? 0, position: t?.impressions ? t.position : null, top10: keywords.filter((k) => k.impressions > 0 && k.position <= 10).length };
  }));
  return {
    date,
    sites,
    clicks: sites.reduce((s, x) => s + x.clicks, 0),
    impressions: sites.reduce((s, x) => s + x.impressions, 0),
    top10: sites.reduce((s, x) => s + x.top10, 0),
    final: date <= shiftSearchDate(today, -3),
    skipped: picked.filter((u) => !counted.includes(u)),
  };
}
