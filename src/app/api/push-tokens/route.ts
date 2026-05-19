import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db/client";
import { json, jsonError, parseJson } from "@/lib/api/json";
import { requireMobileAccess } from "@/lib/auth/mobile-guard";

const RegisterRequest = z.object({
  token: z.string().min(20).max(500),
  platform: z.enum(["android", "ios", "web"]),
  deviceFingerprint: z.string().optional(),
  deviceName: z.string().optional(),
});

export async function POST(request: Request) {
  let principal;
  try {
    principal = await requireMobileAccess(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  let body: z.infer<typeof RegisterRequest>;
  try {
    body = await parseJson(request, RegisterRequest);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const now = new Date().toISOString();
  const existing = await db
    .select({ id: schema.devicePushTokens.id })
    .from(schema.devicePushTokens)
    .where(eq(schema.devicePushTokens.token, body.token))
    .limit(1);

  if (existing.length > 0) {
    // Token ya registrado: actualizar last_seen y reasignar al usuario actual
    await db
      .update(schema.devicePushTokens)
      .set({
        userId: principal.userId,
        platform: body.platform,
        deviceFingerprint: body.deviceFingerprint ?? null,
        deviceName: body.deviceName ?? null,
        lastSeenAt: now,
        disabled: false,
      })
      .where(eq(schema.devicePushTokens.token, body.token));
    return json({ id: existing[0].id, refreshed: true });
  }

  const id = randomUUID();
  await db.insert(schema.devicePushTokens).values({
    id,
    userId: principal.userId,
    platform: body.platform,
    token: body.token,
    deviceFingerprint: body.deviceFingerprint ?? null,
    deviceName: body.deviceName ?? null,
    lastSeenAt: now,
  });

  return json({ id, refreshed: false }, { status: 201 });
}

export async function DELETE(request: Request) {
  let principal;
  try {
    principal = await requireMobileAccess(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) return jsonError("token_query_required", 400);

  await db
    .delete(schema.devicePushTokens)
    .where(eq(schema.devicePushTokens.token, token));

  return json({ ok: true, userId: principal.userId });
}
