import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  primaryKey,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["supervisor", "advertiser", "webmaster", "seo", "creative", "cso"]);
export const metricUnitEnum = pgEnum("metric_unit", ["number", "currency", "percent", "ratio"]);
/** sum = total over the period, avg = daily average, last = latest reported value, ratio = sum(numerator)/sum(denominator) */
export const aggregationEnum = pgEnum("aggregation", ["sum", "avg", "last", "ratio"]);
export const reportStatusEnum = pgEnum("report_status", ["submitted", "approved", "revision"]);
export const reportWindowEnum = pgEnum("report_window", ["previous_day", "today_to_cutoff"]);
export const taskStatusEnum = pgEnum("task_status", ["todo", "in_progress", "review", "done"]);
export const priorityEnum = pgEnum("priority", ["low", "medium", "high", "urgent"]);
export const platformEnum = pgEnum("platform", ["meta", "google", "tiktok", "shopee", "other"]);
export const campaignStatusEnum = pgEnum("campaign_status", ["draft", "active", "paused", "ended"]);
/** Seniority within the advertiser role; only senior advertisers get the performance appraisal. */
export const advertiserLevelEnum = pgEnum("advertiser_level", ["junior", "senior"]);
export const appraisalStatusEnum = pgEnum("appraisal_status", ["draft", "final"]);
/** Creative page ("Konten Iklan"): format of the ad content, its platform status and the team's verdict. */
export const creativeFormatEnum = pgEnum("creative_format", ["video", "grafis", "carousel", "lainnya"]);
export const creativeStatusEnum = pgEnum("creative_status", ["active", "paused", "review", "takedown"]);
export const creativeLabelEnum = pgEnum("creative_label", ["winning", "good", "average", "poor"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 180 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull(),
  /** Advertisers only; null counts as junior. */
  advertiserLevel: advertiserLevelEnum("advertiser_level"),
  /** Optional second job (e.g. an advertiser who also does SEO); KPI and reports cover both roles. */
  secondaryRole: roleEnum("secondary_role"),
  /** Share of the combined KPI score that comes from the secondary role (the primary gets the rest). */
  secondaryShare: integer("secondary_share").notNull().default(40),
  title: varchar("title", { length: 120 }),
  csoPhone: varchar("cso_phone", { length: 20 }),
  /** Optional preset from the bundled profile-avatar collection. */
  avatarId: integer("avatar_id"),
  isActive: boolean("is_active").notNull().default(true),
  invitationPending: boolean("invitation_pending").notNull().default(false),
  /** Bumped to sign the member out everywhere (e.g. after a password change); sessions carry it. */
  sessionVersion: integer("session_version").notNull().default(0),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** KPI definitions per role. Derived metrics (aggregation = ratio) are computed, never entered. */
export const kpiMetrics = pgTable("kpi_metrics", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 60 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  role: roleEnum("role").notNull(),
  unit: metricUnitEnum("unit").notNull().default("number"),
  aggregation: aggregationEnum("aggregation").notNull().default("sum"),
  numeratorKey: varchar("numerator_key", { length: 60 }),
  denominatorKey: varchar("denominator_key", { length: 60 }),
  higherIsBetter: boolean("higher_is_better").notNull().default(true),
  /** Weight in the KPI score. 0 = tracked only. */
  weight: integer("weight").notNull().default(0),
  /** Default in targetMode units: monthly value, daily count, or growth percentage. */
  defaultTarget: doublePrecision("default_target"),
  /** Daily count, monthly total, or percentage growth against the previous month. */
  targetMode: varchar("target_mode", { length: 12 }).$type<"monthly" | "daily" | "growth">().notNull().default("monthly"),
  sortOrder: integer("sort_order").notNull().default(0),
});

/** Override for one member and month, in the metric's targetMode units. */
export const kpiTargets = pgTable(
  "kpi_targets",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    metricId: integer("metric_id")
      .notNull()
      .references(() => kpiMetrics.id, { onDelete: "cascade" }),
    period: varchar("period", { length: 7 }).notNull(), // YYYY-MM
    target: doublePrecision("target").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("kpi_targets_user_metric_period").on(t.userId, t.metricId, t.period)],
);

export type WebmasterTaskSnapshot = {
  taskId: number;
  clientKey?: string;
  title: string;
  category: string | null;
  status: (typeof taskStatusEnum.enumValues)[number];
  priority: (typeof priorityEnum.enumValues)[number];
  dueDate: string | null;
  note: string;
  resultUrl: string;
  minutesSpent: number;
};

export const dailyReports = pgTable(
  "daily_reports",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    summary: text("summary").notNull(),
    /** Imported historical daily totals retain their source date and are read-only. */
    source: varchar("source", { length: 20 }).notNull().default("app"),
    blockers: text("blockers"),
    planTomorrow: text("plan_tomorrow"),
    /** Task state at submission time, independent of subsequent edits or deletion on the task board. */
    webmasterTasks: jsonb("webmaster_tasks").$type<WebmasterTaskSnapshot[]>().notNull().default([]),
    status: reportStatusEnum("status").notNull().default("submitted"),
    reviewerId: integer("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    reviewNote: text("review_note"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("daily_reports_user_date").on(t.userId, t.date), index("daily_reports_date").on(t.date)],
);

export const kpiEntries = pgTable(
  "kpi_entries",
  {
    id: serial("id").primaryKey(),
    reportId: integer("report_id")
      .notNull()
      .references(() => dailyReports.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    metricId: integer("metric_id")
      .notNull()
      .references(() => kpiMetrics.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    value: doublePrecision("value").notNull(),
  },
  (t) => [
    uniqueIndex("kpi_entries_user_metric_date").on(t.userId, t.metricId, t.date),
    index("kpi_entries_date").on(t.date),
  ],
);

/** Meta / Google ad account whose campaigns are pulled and grouped per product by keyword. */
export const adAccounts = pgTable(
  "ad_accounts",
  {
    id: serial("id").primaryKey(),
    platform: platformEnum("platform").notNull(),
    /** Meta ad account ID without "act_", or Google Ads customer ID — digits only. */
    accountId: varchar("account_id", { length: 32 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    lpvConversionAction: varchar("lpv_conversion_action", { length: 180 }),
    createdById: integer("created_by_id").references(() => users.id, { onDelete: "set null" }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastSyncError: text("last_sync_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ad_accounts_platform_account").on(t.platform, t.accountId)],
);

/**
 * One Meta ad and the content (post) it runs, refreshed by "Sinkron dari Meta" on the Creative page.
 * Platform fields are overwritten on every sync; label / format override / creator / editor / note are
 * filled in by the team and kept.
 */
export const adCreatives = pgTable(
  "ad_creatives",
  {
    id: serial("id").primaryKey(),
    adAccountId: integer("ad_account_id")
      .notNull()
      .references(() => adAccounts.id, { onDelete: "cascade" }),
    externalAdId: varchar("external_ad_id", { length: 64 }).notNull(),
    adName: varchar("ad_name", { length: 255 }).notNull(),
    campaignExternalId: varchar("campaign_external_id", { length: 64 }),
    campaignName: varchar("campaign_name", { length: 255 }),
    /** Meta campaign objective, e.g. OUTCOME_SALES → "Iklan konversi". */
    objective: varchar("objective", { length: 60 }),
    /** effective_object_story_id, "<pageId>_<postId>". */
    postId: varchar("post_id", { length: 80 }),
    permalink: text("permalink"),
    thumbnailUrl: text("thumbnail_url"),
    format: creativeFormatEnum("format").notNull().default("lainnya"),
    formatOverride: creativeFormatEnum("format_override"),
    status: creativeStatusEnum("status").notNull(),
    platformStatus: varchar("platform_status", { length: 40 }),
    /** Lifetime numbers from Meta insights. */
    impressions: integer("impressions").notNull().default(0),
    reach: integer("reach").notNull().default(0),
    /** 3-second video views (Meta "video_view" action), the base of hook and hold rate. */
    videoViews: integer("video_views").notNull().default(0),
    thruplays: integer("thruplays").notNull().default(0),
    /** Average seconds watched (video only). */
    avgPlayTime: doublePrecision("avg_play_time"),
    spend: doublePrecision("spend").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    leads: integer("leads").notNull().default(0),
    label: creativeLabelEnum("label"),
    creatorId: integer("creator_id").references(() => users.id, { onDelete: "set null" }),
    editorId: integer("editor_id").references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
    adCreatedAt: timestamp("ad_created_at", { withTimezone: true }),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ad_creatives_account_ad").on(t.adAccountId, t.externalAdId),
    index("ad_creatives_creator").on(t.creatorId),
  ],
);

/** Successful, atomic Creative snapshot for one account and exact date range (including an empty result). */
export const creativeSyncs = pgTable("creative_syncs", {
  id: serial("id").primaryKey(),
  adAccountId: integer("ad_account_id").notNull().references(() => adAccounts.id, { onDelete: "cascade" }),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull(),
}, (t) => [uniqueIndex("creative_syncs_account_period").on(t.adAccountId, t.periodStart, t.periodEnd)]);

/** Whole-period Meta metrics. Never aggregate daily reach or combine different snapshot windows. */
export const creativeMetrics = pgTable("creative_metrics", {
  syncId: integer("sync_id").notNull().references(() => creativeSyncs.id, { onDelete: "cascade" }),
  creativeId: integer("creative_id").notNull().references(() => adCreatives.id, { onDelete: "cascade" }),
  impressions: integer("impressions").notNull(),
  reach: integer("reach").notNull(),
  videoViews: integer("video_views").notNull(),
  thruplays: integer("thruplays").notNull(),
  avgPlayTime: doublePrecision("avg_play_time"),
  spend: doublePrecision("spend").notNull(),
  clicks: integer("clicks").notNull(),
  leads: integer("leads").notNull(),
}, (t) => [primaryKey({ columns: [t.syncId, t.creativeId] }), index("creative_metrics_creative").on(t.creativeId)]);

/** Campaign as it exists on Meta / Google Ads, refreshed by "Sinkron dari Ads". */
export const adCampaigns = pgTable(
  "ad_campaigns",
  {
    id: serial("id").primaryKey(),
    adAccountId: integer("ad_account_id")
      .notNull()
      .references(() => adAccounts.id, { onDelete: "cascade" }),
    externalId: varchar("external_id", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    status: campaignStatusEnum("status").notNull(),
    /** Raw platform status, e.g. ACTIVE / CAMPAIGN_PAUSED / ENABLED. */
    platformStatus: varchar("platform_status", { length: 40 }).notNull(),
    objective: varchar("objective", { length: 80 }),
    dailyBudget: doublePrecision("daily_budget"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ad_campaigns_account_external").on(t.adAccountId, t.externalId)],
);

export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  platform: platformEnum("platform").notNull(),
  objective: varchar("objective", { length: 80 }),
  product: varchar("product", { length: 120 }),
  dailyBudget: doublePrecision("daily_budget").notNull().default(0),
  formLeadSince: date("form_lead_since"),
  landingPageUrl: text("landing_page_url"),
  status: campaignStatusEnum("status").notNull().default("active"),
  ownerId: integer("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  startDate: date("start_date"),
  endDate: date("end_date"),
  notes: text("notes"),
  /** Ad account the product runs in; its campaigns are pulled when generating a report. */
  adAccountId: integer("ad_account_id").references(() => adAccounts.id, { onDelete: "set null" }),
  /** Product code that must appear in the platform campaign name, e.g. "SERUM" for "[SERUM] Retargeting". */
  matchKeyword: varchar("match_keyword", { length: 60 }),
  /**
   * Package names of a registration app that count as this product's closings: comma-separated, matched
   * as text inside the package (longest wins); "*" takes every package no other product of that app claims.
   * Kelas Online packages read "ADULT · SPEAK UP 1 · VIP" / "KIDS · SMART KIDS · VIP".
   */
  registrationPackages: text("registration_packages"),
  /** The registration app `registrationPackages` refers to: "lkbi" or "kelas" (Kelas Online). */
  registrationSource: varchar("registration_source", { length: 20 }).notNull().default("lkbi"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Product-level ad performance captured in the advertiser's two daily reporting windows. */
export const advertiserReportItems = pgTable(
  "advertiser_report_items",
  {
    id: serial("id").primaryKey(),
    reportId: integer("report_id")
      .notNull()
      .references(() => dailyReports.id, { onDelete: "cascade" }),
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    window: reportWindowEnum("window").notNull(),
    performanceDate: date("performance_date").notNull(),
    platform: platformEnum("platform").notNull(),
    /** Snapshot so historical reports keep their label when a campaign is renamed. */
    product: varchar("product", { length: 120 }).notNull(),
    landingPageViews: integer("landing_page_views"),
    spent: doublePrecision("spent").notNull(),
    impressions: integer("impressions").notNull(),
    clicks: integer("clicks").notNull(),
    leads: integer("leads").notNull(),
    adsLeads: integer("ads_leads"),
    leadSource: varchar("lead_source", { length: 12 }).notNull().default("ads"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("advertiser_report_items_report_date_campaign").on(t.reportId, t.performanceDate, t.campaignId),
    index("advertiser_report_items_report").on(t.reportId),
    index("advertiser_report_items_performance_date").on(t.performanceDate),
  ],
);

/** Platform campaigns that were summed into one report item by "Generate dari Ads". */
export const advertiserReportItemCampaigns = pgTable(
  "advertiser_report_item_campaigns",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => advertiserReportItems.id, { onDelete: "cascade" }),
    externalId: varchar("external_id", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    spent: doublePrecision("spent").notNull(),
    impressions: integer("impressions").notNull(),
    clicks: integer("clicks").notNull(),
    landingPageViews: integer("landing_page_views"),
    leads: integer("leads").notNull(),
  },
  (t) => [index("advertiser_report_item_campaigns_item").on(t.itemId)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    assigneeId: integer("assignee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdById: integer("created_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    campaignId: integer("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    /** Kind of work, from the assignee role's catalogue in lib/task-rules.ts. */
    category: varchar("category", { length: 40 }),
    priority: priorityEnum("priority").notNull().default("medium"),
    status: taskStatusEnum("status").notNull().default("todo"),
    dueDate: date("due_date"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tasks_assignee").on(t.assigneeId)],
);

export const activities = pgTable(
  "activities",
  {
    id: serial("id").primaryKey(),
    actorId: integer("actor_id").references(() => users.id, { onDelete: "set null" }),
    /** member the activity is about, used to scope feeds for non-supervisors */
    subjectUserId: integer("subject_user_id").references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 40 }).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    description: text("description"),
    href: text("href"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activities_created").on(t.createdAt)],
);

export const waSessionStatusEnum = pgEnum("wa_session_status", ["disconnected", "connecting", "qr", "connected"]);
export const waMessageStatusEnum = pgEnum("wa_message_status", ["pending", "sent", "failed"]);

/**
 * One WhatsApp (Baileys) login per advertiser. The app sets the desired state (`wantConnected`,
 * group, auto-send); the worker (`pnpm wa:worker`) owns the connection and writes status / QR back.
 */
export const waSessions = pgTable("wa_sessions", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  wantConnected: boolean("want_connected").notNull().default(false),
  status: waSessionStatusEnum("status").notNull().default("disconnected"),
  /** Raw QR payload to render while `status` is "qr". */
  qr: text("qr"),
  phone: varchar("phone", { length: 40 }),
  groupJid: varchar("group_jid", { length: 80 }),
  groupName: varchar("group_name", { length: 160 }),
  /** Groups the account is in, refreshed by the worker: [{ id, subject }]. */
  groups: jsonb("groups").$type<{ id: string; subject: string }[]>(),
  refreshGroups: boolean("refresh_groups").notNull().default(false),
  autoSend: boolean("auto_send").notNull().default(true),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Baileys auth state (creds + signal keys) per session, JSON-encoded with BufferJSON. */
export const waAuth = pgTable(
  "wa_auth",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 200 }).notNull(),
    value: text("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

/** Messages waiting to be sent by the worker from the advertiser's own WhatsApp. */
export const waOutbox = pgTable(
  "wa_outbox",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reportId: integer("report_id").references(() => dailyReports.id, { onDelete: "set null" }),
    groupJid: varchar("group_jid", { length: 80 }).notNull(),
    body: text("body").notNull(),
    status: waMessageStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Not sent before this time, so quick successive edits of a report collapse into one message. */
    sendAfter: timestamp("send_after", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [index("wa_outbox_status").on(t.status), index("wa_outbox_report").on(t.reportId)],
);

/** Single-row heartbeat so the app can tell whether the WhatsApp worker is running. */
export const waWorker = pgTable("wa_worker", {
  id: integer("id").primaryKey(),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }).notNull(),
});

/**
 * Performance appraisal of a senior advertiser for one period (see lib/appraisal.ts for the form):
 * part 1 scores skill & responsibility indicators 1–5, part 2 scores four KPIs in percent.
 */
export const performanceAppraisals = pgTable(
  "performance_appraisals",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reviewerId: integer("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    status: appraisalStatusEnum("status").notNull().default("draft"),
    /** Indicator id → score 1–5. */
    skillScores: jsonb("skill_scores").$type<Record<string, number>>().notNull().default({}),
    skillNote: text("skill_note"),
    /** KPI key → target / real, and the score in percent for KPIs rated by hand. */
    kpi: jsonb("kpi").$type<Record<string, { target: number | null; real: number | null; score: number | null }>>().notNull().default({}),
    kpiNote: text("kpi_note"),
    /** Weighted skill score on the 1–5 scale; null until every indicator is scored. */
    skillScore: doublePrecision("skill_score"),
    /** Total KPI achievement 0–100; null until every KPI has a score. */
    kpiScore: doublePrecision("kpi_score"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  },
  (t) => [index("performance_appraisals_user").on(t.userId)],
);

/** App-wide key/value settings, e.g. the Meta Ads connection. Secrets are stored encrypted (see lib/secret-box). */
export const appSettings = pgTable("app_settings", {
  key: varchar("key", { length: 80 }).primaryKey(),
  value: text("value").notNull(),
  updatedById: integer("updated_by_id").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;

/**
 * The advertisers a Creative member works for ("Creative Ryant"). They see only those advertisers'
 * ad contents on Creative, as the advertisers do; a Creative without rows here sees the whole team.
 */
export const creativeAdvertisers = pgTable(
  "creative_advertisers",
  {
    creativeId: integer("creative_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    advertiserId: integer("advertiser_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.creativeId, t.advertiserId] }), index("creative_advertisers_advertiser").on(t.advertiserId)],
);
export type AdvertiserLevel = (typeof advertiserLevelEnum.enumValues)[number];
export type PerformanceAppraisal = typeof performanceAppraisals.$inferSelect;
export type AdCreative = typeof adCreatives.$inferSelect;
export type WaSession = typeof waSessions.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
export type KpiMetric = typeof kpiMetrics.$inferSelect;
export type DailyReport = typeof dailyReports.$inferSelect;
export type AdvertiserReportItem = typeof advertiserReportItems.$inferSelect;
export type AdvertiserReportItemCampaign = typeof advertiserReportItemCampaigns.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type AdAccount = typeof adAccounts.$inferSelect;
export type AdCampaign = typeof adCampaigns.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Activity = typeof activities.$inferSelect;

/** Only SHA-256 digests are stored; raw reset links are delivered by email. */
export const passwordResetTokens = pgTable("password_reset_tokens", {
  tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionVersion: integer("session_version").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
}, (t) => [index("password_reset_user_idx").on(t.userId), index("password_reset_expiry_idx").on(t.expiresAt)]);

/** Shared across server processes; keys are HMACs, never raw emails or IP addresses. */
export const passwordResetLimits = pgTable("password_reset_limits", {
  key: varchar("key", { length: 64 }).primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull().default(1),
});

/** Telegram bot credentials belong to the signed-in advertiser, independently of WhatsApp. */
export const telegramConnections = pgTable("telegram_connections", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull(), // AES-GCM encrypted; never returned to the browser.
  botName: text("bot_name").notNull(),
  chatId: varchar("chat_id", { length: 40 }).notNull(),
  chatTitle: text("chat_title").notNull(),
  threadId: integer("thread_id"),
  enabled: boolean("enabled").notNull().default(true),
  autoSend: boolean("auto_send").notNull().default(true),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
/** One team destination; managed by supervisors. Legacy personal connections are retained for audit only. */
export const sharedTelegramConnection = pgTable("shared_telegram_connection", {
  id: integer("id").primaryKey(),
  updatedById: integer("updated_by_id").references(() => users.id, { onDelete: "set null" }),
  token: text("token").notNull(), // AES-GCM encrypted; never returned to the browser.
  botName: text("bot_name").notNull(),
  chatId: varchar("chat_id", { length: 40 }).notNull(),
  chatTitle: text("chat_title").notNull(),
  threadId: integer("thread_id"),
  enabled: boolean("enabled").notNull().default(true),
  autoSend: boolean("auto_send").notNull().default(true),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const telegramOutbox = pgTable("telegram_outbox", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reportId: integer("report_id").references(() => dailyReports.id, { onDelete: "set null" }),
  connectionVersion: integer("connection_version").notNull(),
  body: text("body").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  manual: boolean("manual").notNull().default(false),
  nextPart: integer("next_part").notNull().default(0),
  attempts: integer("attempts").notNull().default(0),
  error: text("error"),
  sendAfter: timestamp("send_after", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
}, (t) => [index("telegram_outbox_pending").on(t.status, t.sendAfter), index("telegram_outbox_report").on(t.userId, t.reportId)]);
export const telegramWorker = pgTable("telegram_worker", {
  id: integer("id").primaryKey(),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }).notNull(),
});

/** One current, single-use invitation per pending member; only its SHA-256 digest is stored. */
export const memberInvitations = pgTable("member_invitations", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  email: varchar("email", { length: 180 }).notNull(),
  invitedById: integer("invited_by_id").references(() => users.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  deliveryStatus: varchar("delivery_status", { length: 16 }).notNull().default("pending"),
});

/** Audit trail for CSV imports; one source row per imported product item. */
export const legacyReportRows = pgTable("legacy_report_rows", {
  id: serial("id").primaryKey(),
  fileHash: varchar("file_hash", { length: 64 }).notNull(),
  sourceRow: integer("source_row").notNull(),
  sourceData: jsonb("source_data").$type<Record<string, unknown>>().notNull(),
  itemId: integer("item_id").notNull().references(() => advertiserReportItems.id, { onDelete: "cascade" }),
}, (t) => [uniqueIndex("legacy_report_rows_file_row").on(t.fileHash, t.sourceRow), uniqueIndex("legacy_report_rows_item").on(t.itemId)]);

export const orderForms = pgTable("order_forms", {
  id: serial("id").primaryKey(), slug: varchar("slug", { length: 32 }).notNull().unique(),
  ownerId: integer("owner_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  campaignId: integer("campaign_id").notNull().references(() => campaigns.id, { onDelete: "restrict" }),
  title: varchar("title", { length: 120 }).notNull(), description: text("description").notNull().default(""),
  fields: jsonb("fields").$type<import("@/lib/order-form-input").OrderFields>().notNull(),
  appearance: jsonb("appearance").$type<import("@/lib/order-form-config").FormAppearance>().notNull().default(sql`'{}'::jsonb`),
  tracking: jsonb("tracking").$type<import("@/lib/order-form-config").FormTracking>().notNull().default(sql`'{}'::jsonb`),
  weights: jsonb("weights").$type<Record<string,number>>().notNull().default({}),
  routingCredits: jsonb("routing_credits").$type<Record<string,number>>().notNull().default({}),
  routing: varchar("routing", { length: 20 }).notNull().default("fixed"),
  assigneeIds: jsonb("assignee_ids").$type<number[]>().notNull().default([]),
  cursor: integer("cursor").notNull().default(0), published: boolean("published").notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  source: varchar("source", { length: 12 }).notNull().default("ads"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const orderFormDomains = pgTable("order_form_domains", {
  id: serial("id").primaryKey(),
  formId: integer("form_id").notNull().unique().references(() => orderForms.id, { onDelete: "restrict" }),
  hostname: varchar("hostname", { length: 253 }).notNull().unique(),
  verificationToken: varchar("verification_token", { length: 64 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending_dns"),
  error: text("error"),
  checkedAt: timestamp("checked_at", { withTimezone: true }),
  tlsAttemptAt: timestamp("tls_attempt_at", { withTimezone: true }),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const orderLeads = pgTable("order_leads", {
  id: serial("id").primaryKey(), publicId: varchar("public_id", { length: 36 }).notNull().unique(),
  formId: integer("form_id").notNull().references(() => orderForms.id, { onDelete: "restrict" }),
  ownerId: integer("owner_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  campaignId: integer("campaign_id").notNull().references(() => campaigns.id, { onDelete: "restrict" }),
  assigneeId: integer("assignee_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  csoPhone: varchar("cso_phone", { length: 20 }).notNull(),
  product: varchar("product", { length: 120 }).notNull(), source: varchar("source", { length: 12 }).notNull(),
  platform: varchar("platform", { length: 20 }).notNull(),
  name: varchar("name", { length: 120 }), phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 180 }), city: varchar("city", { length: 120 }),
  date: date("date").notNull(), status: varchar("status", { length: 20 }).notNull().default("new"),
  paymentStatus: varchar("payment_status", { length: 16 }).notNull().default("unpaid"),
  revenue: doublePrecision("revenue").notNull().default(0),
  followUpStep: integer("follow_up_step").notNull().default(0),
  waOpenedAt: jsonb("wa_opened_at").$type<Record<string, string>>().notNull().default({}),
  followUpAt: timestamp("follow_up_at", { withTimezone: true }),
  notes: text("notes").notNull().default(""), attribution: jsonb("attribution").$type<Record<string,string>>().notNull().default({}),
  measurementConsent: boolean("measurement_consent").notNull().default(false),
  metaTracking: jsonb("meta_tracking").$type<{event?:string;pixelIds?:string[]}>().notNull().default({}),
  requestHash: varchar("request_hash", { length: 64 }).notNull(),
  contactHash: varchar("contact_hash", { length: 64 }).notNull(),
  whatsappUrl: text("whatsapp_url").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("order_leads_form_request").on(t.formId, t.requestHash), uniqueIndex("order_leads_form_contact_day").on(t.formId,t.date,t.contactHash), index("order_leads_owner_date").on(t.ownerId,t.date), index("order_leads_assignee_date").on(t.assigneeId,t.date), index("order_leads_campaign_date").on(t.campaignId,t.date)]);
export const orderLeadEvents = pgTable("order_lead_events", {
  id: serial("id").primaryKey(), leadId: integer("lead_id").notNull().references(() => orderLeads.id, { onDelete: "cascade" }),
  actorId: integer("actor_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  detail: text("detail").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leadWaTemplates = pgTable("lead_wa_templates", {
  campaignId: integer("campaign_id").primaryKey().references(() => campaigns.id, { onDelete: "cascade" }),
  messages: jsonb("messages").$type<import("@/lib/lead-wa-message").WaMessages>().notNull(),
  updatedBy: integer("updated_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Tokens are separate from order_forms so form DTOs never contain credentials. */
export const orderFormCapi = pgTable("order_form_capi", {
 formId: integer("form_id").primaryKey().references(()=>orderForms.id,{onDelete:"cascade"}),
 pixelId: varchar("pixel_id",{length:25}).notNull(), token: text("token").notNull(),
 enabled: boolean("enabled").notNull().default(false), version: varchar("version",{length:36}).notNull(),
 testSucceeded: boolean("test_succeeded"), testStatus: text("test_status"), testedAt: timestamp("tested_at",{withTimezone:true}),
 updatedAt: timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
});
export const metaCapiOutbox = pgTable("meta_capi_outbox", {
 id: serial("id").primaryKey(), formId: integer("form_id").notNull().references(()=>orderForms.id,{onDelete:"cascade"}),
 leadId: integer("lead_id").notNull().references(()=>orderLeads.id,{onDelete:"cascade"}),
 eventId: varchar("event_id",{length:36}).notNull().unique(), eventName: varchar("event_name",{length:40}).notNull(),
 pixelId: varchar("pixel_id",{length:25}).notNull(), configVersion: varchar("config_version",{length:36}).notNull(),
 payload: text("payload").notNull(), status: varchar("status",{length:20}).notNull().default("pending"),
 attempts: integer("attempts").notNull().default(0), lastError: text("last_error"),
 errorCode: integer("error_code"), traceId: varchar("trace_id",{length:100}),
 nextAttemptAt: timestamp("next_attempt_at",{withTimezone:true}).notNull().defaultNow(),
 sentAt: timestamp("sent_at",{withTimezone:true}), createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[index("meta_capi_due").on(t.status,t.nextAttemptAt)]);

/** AI ad analyses via Kie.ai: "creatives" (Claude, Ringkasan) and "creative_content" (Gemini, one content). Runs in the background: "running" → "done" | "failed". */
export const aiAnalyses = pgTable("ai_analyses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** What was analysed, e.g. "creatives". */
  kind: varchar("kind", { length: 30 }).notNull(),
  /** Canonical filters of the analysed view, so the page shows the analysis that matches it. */
  filterKey: text("filter_key").notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  status: varchar("status", { length: 12 }).notNull().default("running"),
  /** The numbers sent to the model, kept so the result can be read against them later. */
  input: jsonb("input").notNull(),
  result: jsonb("result"),
  error: text("error"),
  model: varchar("model", { length: 60 }),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  /** Credits Kie reported for the run (Gemini does); null = estimate from tokens. */
  credits: doublePrecision("credits"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => [index("ai_analyses_user_kind").on(t.userId, t.kind, t.createdAt), index("ai_analyses_kind_filter").on(t.kind, t.filterKey, t.createdAt)]);

export type AiAnalysis = typeof aiAnalyses.$inferSelect;

/**
 * Copy of the LKBI Mr.BOB registration app (API integrasi v1), kept for closing / revenue KPIs. Only what
 * the KPIs and their review need: no phone, email, birth date, address or transfer proof.
 */
export const externalRegistrations = pgTable("external_registrations", {
  /** Which registration app: "lkbi" (lkbimrbob.com) or "kelas" (Kelas Online, app.kelasonlinemrbob.com). */
  source: varchar("source", { length: 20 }).notNull().default("lkbi"),
  /** The source `id`: never reused, unlike the REG- number. Unique within its source. */
  id: integer("id").notNull(),
  registrationId: varchar("registration_id", { length: 40 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  packageName: varchar("package_name", { length: 200 }).notNull(),
  period: varchar("period", { length: 80 }),
  status: varchar("status", { length: 20 }).notNull(),
  totalPrice: doublePrecision("total_price").notNull().default(0),
  infoSource: varchar("info_source", { length: 160 }),
  city: varchar("city", { length: 120 }),
  /** First payment the admin accepted (still accepted now); null while unpaid or after a rejection. */
  paidAt: timestamp("paid_at", { withTimezone: true }),
  registeredAt: timestamp("registered_at", { withTimezone: true }).notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.source, t.id] }), index("external_registrations_paid").on(t.paidAt), index("external_registrations_registered").on(t.registeredAt)]);

export type ExternalRegistration = typeof externalRegistrations.$inferSelect;
