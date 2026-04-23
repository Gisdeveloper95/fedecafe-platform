import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { db, schema } from "@/db/client";

const SESSION_COOKIE = "fedecafe_session";
const SESSION_TTL_DAYS = 30;

export type WebSessionUser = {
  id: string;
  username: string;
  fullName: string;
  role: "admin" | "operario";
};

export async function createWebSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const id = crypto.randomUUID();
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(schema.webSessions).values({
    id,
    userId,
    token,
    expiresAt: expires.toISOString(),
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });

  return token;
}

export async function destroyWebSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(schema.webSessions).where(eq(schema.webSessions.token, token));
    cookieStore.delete(SESSION_COOKIE);
  }
}

export async function getWebSessionUser(): Promise<WebSessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      fullName: schema.users.fullName,
      role: schema.users.role,
      active: schema.users.active,
      expiresAt: schema.webSessions.expiresAt,
    })
    .from(schema.webSessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.webSessions.userId))
    .where(eq(schema.webSessions.token, token))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  if (!row.active) return null;
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    await db.delete(schema.webSessions).where(eq(schema.webSessions.token, token));
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    fullName: row.fullName,
    role: row.role as "admin" | "operario",
  };
}

export async function requireAdmin(): Promise<WebSessionUser> {
  const user = await getWebSessionUser();
  if (!user || user.role !== "admin") {
    throw new Response("Unauthorized", { status: 401 });
  }
  return user;
}
