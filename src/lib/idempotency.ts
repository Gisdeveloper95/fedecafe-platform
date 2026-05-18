import { and, eq, lte } from "drizzle-orm";

import { db, schema } from "@/db/client";

const DEFAULT_TTL_DAYS = 30;

export async function getIdempotentResponse<T>(args: {
  key: string;
  scope: string;
}): Promise<T | null> {
  const now = new Date().toISOString();
  const rows = await db
    .select()
    .from(schema.idempotencyKeys)
    .where(
      and(
        eq(schema.idempotencyKeys.key, args.key),
        eq(schema.idempotencyKeys.scope, args.scope),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt < now) {
    await db
      .delete(schema.idempotencyKeys)
      .where(eq(schema.idempotencyKeys.key, args.key));
    return null;
  }
  try {
    return JSON.parse(row.responseJson) as T;
  } catch {
    return null;
  }
}

export async function storeIdempotentResponse<T>(args: {
  key: string;
  scope: string;
  response: T;
  ttlDays?: number;
}): Promise<void> {
  const ttlDays = args.ttlDays ?? DEFAULT_TTL_DAYS;
  const expiresAt = new Date(
    Date.now() + ttlDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  await db
    .insert(schema.idempotencyKeys)
    .values({
      key: args.key,
      scope: args.scope,
      responseJson: JSON.stringify(args.response),
      expiresAt,
    })
    .onConflictDoUpdate({
      target: schema.idempotencyKeys.key,
      set: {
        responseJson: JSON.stringify(args.response),
        expiresAt,
      },
    });
}

// Limpieza periódica de claves vencidas (llamar desde un cron).
export async function cleanupExpiredKeys(): Promise<number> {
  const now = new Date().toISOString();
  const res = await db
    .delete(schema.idempotencyKeys)
    .where(lte(schema.idempotencyKeys.expiresAt, now))
    .returning({ key: schema.idempotencyKeys.key });
  return res.length;
}
