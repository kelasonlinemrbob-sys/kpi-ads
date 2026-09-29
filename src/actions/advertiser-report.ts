import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import {
  advertiserReportItemCampaigns,
  advertiserReportItems,
  campaigns,
  dailyReports,
  kpiEntries,
  kpiMetrics,
  platformEnum,
} from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import { logActivity } from "@/lib/data";
import { queueReportMessage } from "@/lib/whatsapp";
import { todayISO } from "@/lib/kpi";
import { advertiserReportWindows, isAdvertiserReportDay } from "@/lib/reporting";
import { addDays, formatDate } from "@/lib/utils";
import type { FormState } from "./auth";

const BACKFILL_DAYS = 7;

const breakdownSchema = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(255),
  spent: z.coerce.number().finite().min(0),
  impressions: z.coerce.number().int().min(0),
  clicks: z.coerce.number().int().min(0),
  leads: z.coerce.number().int().min(0),
});

const itemSchema = z.object({
  campaignId: z.coerce.number().int().positive(),
  performanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Periode laporan tidak valid."),
  platform: z.enum(platformEnum.enumValues),
  spent: z.coerce.number().finite().min(0, "Spent tidak boleh negatif."),
  impressions: z.coerce.number().int().min(0, "Impression harus berupa angka positif."),
  clicks: z.coerce.number().int().min(0, "Click harus berupa angka positif."),
  leads: z.coerce.number().int().min(0, "Result lead harus berupa angka positif."),
  /** Platform campaigns behind a generated row; dropped when the row no longer adds up to them. */
  campaigns: z.array(breakdownSchema).max(500).optional(),
});

type ItemInput = z.infer<typeof itemSchema>;

/** A breakdown is only kept while it still sums exactly to the reported numbers. */
function consistentBreakdown(item: ItemInput) {
  const list = item.campaigns ?? [];
  if (!list.length) return [];
  const sum = (key: "spent" | "impressions" | "clicks" | "leads") => list.reduce((total, c) => total + c[key], 0);
  const matches =
    Math.round(sum("spent")) === Math.round(item.spent) &&
    sum("impressions") === item.impressions &&
    sum("clicks") === item.clicks &&
    sum("leads") === item.leads;
  return matches ? list : [];
}

const inputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal laporan tidak valid."),
  notes: z.string().trim().min(5, "Catatan wajib diisi minimal 5 karakter.").max(4000),
  items: z.array(itemSchema).min(1, "Isi minimal satu product."),
});

export async function saveAdvertiserReport(user: SessionUser, formData: FormData): Promise<FormState> {
  let items: unknown;
  try {
    items = JSON.parse(String(formData.get("advertiserItems") ?? "[]"));
  } catch {
    return { error: "Data detail iklan tidak valid. Muat ulang halaman lalu coba lagi." };
  }

  const parsed = inputSchema.safeParse({
    date: formData.get("date"),
    notes: formData.get("summary"),
    items,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { date, notes } = parsed.data;

  const today = todayISO();
  if (date > today) return { error: "Laporan tidak dapat dibuat untuk tanggal mendatang." };
  if (date < addDays(today, -BACKFILL_DAYS)) {
    return { error: `Laporan hanya dapat diisi mundur maksimal ${BACKFILL_DAYS} hari.` };
  }
  if (!isAdvertiserReportDay(date)) {
    return { error: "Laporan advertiser hanya diwajibkan untuk hari Senin sampai Jumat." };
  }

  const periods = new Map(advertiserReportWindows(date).map((period) => [period.performanceDate, period]));
  if (parsed.data.items.some((item) => !periods.has(item.performanceDate))) {
    return { error: "Periode laporan tidak sesuai dengan tanggal laporan. Muat ulang halaman lalu coba lagi." };
  }
  // Only the periods present in the payload are replaced; other periods keep their saved rows.
  const submittedDates = [...new Set(parsed.data.items.map((item) => item.performanceDate))];

  const uniqueRows = new Set(parsed.data.items.map((item) => `${item.performanceDate}:${item.campaignId}`));
  if (uniqueRows.size !== parsed.data.items.length) {
    return { error: "Satu product hanya boleh muncul sekali pada setiap periode." };
  }

  const campaignIds = [...new Set(parsed.data.items.map((item) => item.campaignId))];
  const assignedCampaigns = await db.select().from(campaigns).where(inArray(campaigns.id, campaignIds));
  const campaignById = new Map(assignedCampaigns.map((campaign) => [campaign.id, campaign]));
  for (const item of parsed.data.items) {
    const campaign = campaignById.get(item.campaignId);
    if (!campaign || campaign.ownerId !== user.id) {
      return { error: "Product yang dipilih tidak di-assign kepada advertiser ini." };
    }
    if (campaign.platform !== item.platform) {
      return { error: `Platform untuk ${campaign.product || campaign.name} tidak sesuai dengan campaign.` };
    }
  }

  const [existing] = await db
    .select()
    .from(dailyReports)
    .where(and(eq(dailyReports.userId, user.id), eq(dailyReports.date, date)))
    .limit(1);
  const metrics = await db
    .select()
    .from(kpiMetrics)
    .where(and(eq(kpiMetrics.role, "advertiser"), inArray(kpiMetrics.key, ["ad_spend", "leads"])));

  const reportId = await db.transaction(async (tx) => {
    let id: number;
    if (existing) {
      await tx
        .update(dailyReports)
        .set({
          summary: notes,
          blockers: null,
          planTomorrow: null,
          status: "submitted",
          reviewerId: null,
          reviewNote: null,
          reviewedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(dailyReports.id, existing.id));
      id = existing.id;
    } else {
      const [row] = await tx
        .insert(dailyReports)
        .values({ userId: user.id, date, summary: notes })
        .returning({ id: dailyReports.id });
      id = row!.id;
    }

    await tx
      .delete(advertiserReportItems)
      .where(and(eq(advertiserReportItems.reportId, id), inArray(advertiserReportItems.performanceDate, submittedDates)));
    await tx.delete(kpiEntries).where(eq(kpiEntries.reportId, id));

    const inserted = await tx
      .insert(advertiserReportItems)
      .values(
        parsed.data.items.map((item) => {
          const campaign = campaignById.get(item.campaignId)!;
          return {
            reportId: id,
            campaignId: campaign.id,
            window: periods.get(item.performanceDate)!.key,
            performanceDate: item.performanceDate,
            platform: campaign.platform,
            product: campaign.product?.trim() || campaign.name,
            spent: item.spent,
            impressions: item.impressions,
            clicks: item.clicks,
            leads: item.leads,
          };
        }),
      )
      .returning({
        id: advertiserReportItems.id,
        performanceDate: advertiserReportItems.performanceDate,
        campaignId: advertiserReportItems.campaignId,
      });

    const itemIdByKey = new Map(inserted.map((row) => [`${row.performanceDate}:${row.campaignId}`, row.id]));
    const breakdown = parsed.data.items.flatMap((item) => {
      const itemId = itemIdByKey.get(`${item.performanceDate}:${item.campaignId}`)!;
      return consistentBreakdown(item).map((c) => ({
        itemId,
        externalId: c.id,
        name: c.name,
        spent: c.spent,
        impressions: c.impressions,
        clicks: c.clicks,
        leads: c.leads,
      }));
    });
    if (breakdown.length) await tx.insert(advertiserReportItemCampaigns).values(breakdown);

    // KPI counts full days only, i.e. every "previous_day" period (Friday–Sunday on a Monday report).
    const previousRows = await tx
      .select({ spent: advertiserReportItems.spent, leads: advertiserReportItems.leads })
      .from(advertiserReportItems)
      .where(and(eq(advertiserReportItems.reportId, id), eq(advertiserReportItems.window, "previous_day")));
    const previousTotals = previousRows.reduce(
      (total, item) => ({ spent: total.spent + item.spent, leads: total.leads + item.leads }),
      { spent: 0, leads: 0 },
    );
    const values = (previousRows.length ? metrics : []).flatMap((metric) => {
      const value = metric.key === "ad_spend" ? previousTotals.spent : metric.key === "leads" ? previousTotals.leads : null;
      return value === null ? [] : [{ reportId: id, userId: user.id, metricId: metric.id, date, value }];
    });
    if (values.length) await tx.insert(kpiEntries).values(values);
    return id;
  });

  await logActivity({
    actorId: user.id,
    subjectUserId: user.id,
    type: "report_submitted",
    title: existing ? "Laporan Iklan Diperbarui" : "Laporan Iklan Dikirim",
    description: `${user.name} ${existing ? "memperbarui" : "mengirim"} laporan iklan ${formatDate(date, {
      day: "2-digit",
      month: "short",
    })}`,
    href: `/reports/${reportId}`,
  });

  // Push to the advertiser's WhatsApp group; a WhatsApp problem must never block saving the report.
  try {
    await queueReportMessage(user.id, reportId, Boolean(existing));
  } catch (error) {
    console.error("Failed to queue WhatsApp report message", error);
  }

  revalidatePath("/", "layout");
  redirect(`/reports/${reportId}?saved=1`);
}
