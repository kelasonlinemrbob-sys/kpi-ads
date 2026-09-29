import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataTypeMap,
} from "@whiskeysockets/baileys";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { waAuth } from "@/db/schema";

/**
 * Baileys auth state stored in Postgres (one row per creds / signal key), the database
 * equivalent of useMultiFileAuthState, so sessions survive restarts and work on any host.
 */
export async function usePostgresAuthState(userId: number): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const write = async (key: string, data: unknown) => {
    const value = JSON.stringify(data, BufferJSON.replacer);
    await db
      .insert(waAuth)
      .values({ userId, key, value })
      .onConflictDoUpdate({ target: [waAuth.userId, waAuth.key], set: { value } });
  };
  const remove = (keys: string[]) =>
    keys.length ? db.delete(waAuth).where(and(eq(waAuth.userId, userId), inArray(waAuth.key, keys))) : Promise.resolve();

  const [credsRow] = await db
    .select()
    .from(waAuth)
    .where(and(eq(waAuth.userId, userId), eq(waAuth.key, "creds")));
  const creds: AuthenticationCreds = credsRow ? JSON.parse(credsRow.value, BufferJSON.reviver) : initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const result: { [id: string]: SignalDataTypeMap[T] } = {};
          if (!ids.length) return result;
          const rows = await db
            .select()
            .from(waAuth)
            .where(and(eq(waAuth.userId, userId), inArray(waAuth.key, ids.map((id) => `${type}-${id}`))));
          const byKey = new Map(rows.map((row) => [row.key, row.value]));
          for (const id of ids) {
            const raw = byKey.get(`${type}-${id}`);
            if (!raw) continue;
            let value = JSON.parse(raw, BufferJSON.reviver);
            if (type === "app-state-sync-key" && value) value = proto.Message.AppStateSyncKeyData.fromObject(value);
            result[id] = value;
          }
          return result;
        },
        set: async (data) => {
          const deletes: string[] = [];
          const writes: Promise<unknown>[] = [];
          for (const category of Object.keys(data) as (keyof SignalDataTypeMap)[]) {
            for (const [id, value] of Object.entries(data[category] ?? {})) {
              const key = `${category}-${id}`;
              if (value) writes.push(write(key, value));
              else deletes.push(key);
            }
          }
          await Promise.all([...writes, remove(deletes)]);
        },
      },
    },
    saveCreds: () => write("creds", creds),
  };
}

/** Forgets a session completely (after logout), so the next connect shows a fresh QR. */
export async function clearAuthState(userId: number) {
  await db.delete(waAuth).where(eq(waAuth.userId, userId));
}
