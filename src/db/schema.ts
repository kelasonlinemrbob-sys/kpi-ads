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

export const roleEnum = pgEnum("role", ["supervisor", "advertiser", "webmaster", "seo"]);
export const metricUnitEnum = pgEnum("metric_unit", ["number", "currency", "percent", "ratio"]);
/** sum = total over the period, avg = daily average, last = latest reported value, ratio = sum(numerator)/sum(denominator) */
export const aggregationEnum = pgEnum("aggregation", ["sum", "avg", "last", "ratio"]);
export const reportStatusEnum = pgEnum("report_status", ["submitted", "approved", "revision"]);
export const reportWindowEnum = pgEnum("report_window", ["previous_day", "today_to_cutoff"]);
export const taskStatusEnum = pgEnum("task_status", ["todo", "in_progress", "review", "done"]);
export const priorityEnum = pgEnum("priority", ["low", "medium", "high", "urgent"]);
export const platformEnum = pgEnum("platform", ["meta", "google", "tiktok", "shopee", "other"]);
export const campaignStatusEnum = pgEnum("campaign_status", ["draft", "active", "paused", "ended"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 180 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull(),
  title: varchar("title", { length: 120 }),
  isActive: boolean("is_active").notNull().default(true),
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
  /** Monthly target used when no per-user target exists. */
  defaultTarget: doublePrecision("default_target"),
  sortOrder: integer("sort_order").notNull().default(0),
});

/** Monthly target override for one member. */
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

export const dailyReports = pgTable(
  "daily_reports",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    summary: text("summary").notNull(),
    blockers: text("blockers"),
    planTomorrow: text("plan_tomorrow"),
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
    createdById: integer("created_by_id").references(() => users.id, { onDelete: "set null" }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastSyncError: text("last_sync_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ad_accounts_platform_account").on(t.platform, t.accountId)],
);

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
    spent: doublePrecision("spent").notNull(),
    impressions: integer("impressions").notNull(),
    clicks: integer("clicks").notNull(),
    leads: integer("leads").notNull(),
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

/** App-wide key/value settings, e.g. the Meta Ads connection. Secrets are stored encrypted (see lib/secret-box). */
export const appSettings = pgTable("app_settings", {
  key: varchar("key", { length: 80 }).primaryKey(),
  value: text("value").notNull(),
  updatedById: integer("updated_by_id").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
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
