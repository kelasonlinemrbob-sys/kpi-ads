import "server-only";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";

export function userIntegrationKey(key: string, userId: number) {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("Pemilik integrasi tidak valid.");
  return `user.${userId}.${key}`;
}

/** Existing shared credentials belong only to the user who saved them. Never fall back to another user's or environment credentials. */
export async function readUserIntegrationSettings(keys: string[], userId: number | null) {
  if (userId === null) return {} as Record<string, string>;
  const scoped = keys.map((key) => userIntegrationKey(key, userId));
  const rows = await db.select().from(appSettings).where(inArray(appSettings.key, [...keys, ...scoped]));
  return Object.fromEntries(keys.flatMap((key) => {
    const own = rows.find((row) => row.key === userIntegrationKey(key, userId));
    const legacy = rows.find((row) => row.key === key && row.updatedById === userId);
    const row = own ?? legacy;
    return row ? [[key, row.value]] : [];
  }));
}
