import type { ActivityItem } from "@/lib/data";
import type { FeedItem } from "@/components/dashboard/activity-feed";
import { addDays, toISODate } from "@/lib/utils";
import { todayISO } from "@/lib/kpi";

export function toFeed(items: ActivityItem[]): FeedItem[] {
  const today = todayISO();
  const yesterday = addDays(today, -1);
  return items.map((a) => {
    const day = toISODate(a.createdAt);
    const bucket = day === today ? "today" : day === yesterday ? "yesterday" : "week";
    const time =
      bucket === "week"
        ? a.createdAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
        : a.createdAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    return { id: a.id, type: a.type, title: a.title, description: a.description, href: a.href, time, bucket };
  });
}
