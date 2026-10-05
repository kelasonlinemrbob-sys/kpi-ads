import "server-only";
import { cache } from "react";
import { sessionPolicy } from "./session-policy";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type Role, type User } from "@/db/schema";

export const SESSION_COOKIE = "kpi_session";


function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

export async function createSession(userId: number, sessionVersion = 0, remember?: boolean) {
  const store = await cookies();
  // Settings actions preserve the signed-in device's original choice.
  if (remember === undefined) {
    remember = false;
    const previous = store.get(SESSION_COOKIE)?.value;
    if (previous) {
      try {
        const { payload } = await jwtVerify(previous, secret());
        remember = payload.uid === userId && payload.remember === true;
      } catch { /* Invalid sessions do not become persistent. */ }
    }
  }
  const policy = sessionPolicy(remember);
  const token = await new SignJWT({ uid: userId, sv: sessionVersion, remember })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(policy.expiresIn)
    .sign(secret());
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...policy.cookie,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export type SessionUser = Omit<User, "passwordHash">;

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  let uid: number;
  let sv: number;
  try {
    const { payload } = await jwtVerify(token, secret());
    uid = Number(payload.uid);
    sv = Number(payload.sv ?? 0);
  } catch {
    return null;
  }
  const [user] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
  // A session from before "sign out everywhere" / a password change no longer counts.
  if (!user || !user.isActive || user.sessionVersion !== sv) return null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...rest } = user;
  return rest;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(...roles: Role[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/dashboard");
  return user;
}
