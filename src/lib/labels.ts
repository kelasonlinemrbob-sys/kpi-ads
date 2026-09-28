import type { Campaign, Task } from "@/db/schema";

export const PLATFORM_LABEL: Record<Campaign["platform"], string> = {
  meta: "Meta Ads",
  google: "Google Ads",
  tiktok: "TikTok Ads",
  shopee: "Shopee Ads",
  other: "Other",
};

export const PLATFORM_DOT: Record<Campaign["platform"], string> = {
  meta: "bg-[oklch(0.55_0.2_260)]",
  google: "bg-[oklch(0.65_0.17_145)]",
  tiktok: "bg-foreground",
  shopee: "bg-[oklch(0.66_0.2_40)]",
  other: "bg-muted-foreground",
};

export const CAMPAIGN_STATUS_LABEL: Record<Campaign["status"], string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  ended: "Ended",
};

export const TASK_STATUS_LABEL: Record<Task["status"], string> = {
  todo: "To Do",
  in_progress: "In Progress",
  review: "In Review",
  done: "Done",
};

export const PRIORITY_LABEL: Record<Task["priority"], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};
