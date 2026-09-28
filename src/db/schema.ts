import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  pgEnum,
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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

export type User = typeof users.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
export type KpiMetric = typeof kpiMetrics.$inferSelect;
export type DailyReport = typeof dailyReports.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Activity = typeof activities.$inferSelect;
