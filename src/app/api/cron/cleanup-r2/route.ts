import { and, eq, lt } from "drizzle-orm";

import { db, schema } from "@/db/client";
import { env } from "@/lib/env";
import { json, jsonError } from "@/lib/api/json";
import { cleanupExpiredKeys } from "@/lib/idempotency";
import { deleteObject, isR2Configured } from "@/lib/storage/r2";

const DEMO_TOKEN_REVOKED_GRACE_DAYS = 30;

/**
 * Cron diario:
 *  1. Borra `idempotency_keys` vencidas.
 *  2. Identifica blobs en R2 huérfanos (>7 días, sin pending_capture asociado).
 *     Como R2 no nos da un listing barato por convención de prefijo, esta
 *     versión solo recorre las capturas en estado "rejected" / "apply_failed"
 *     con más de 7 días y borra sus attachments. (Las "approved" se mantienen
 *     porque sus fotos pueden ser referencia del medidor/estructura.)
 *
 * Protegido con `Authorization: Bearer <CRON_SECRET>`. Vercel Cron pasa este
 * header si lo configuras en vercel.json + Settings.
 */
export async function GET(request: Request) {
  if (env.CRON_SECRET) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${env.CRON_SECRET}`) {
      return jsonError("forbidden", 403);
    }
  }

  const expired = await cleanupExpiredKeys();

  const result: {
    idempotencyKeysDeleted: number;
    orphansDeleted: number;
    capturesScanned: number;
    revokedDemoTokensDeleted: number;
    skipped?: string;
  } = {
    idempotencyKeysDeleted: expired,
    orphansDeleted: 0,
    capturesScanned: 0,
    revokedDemoTokensDeleted: 0,
  };

  // Auto-borrar demo_tokens revocados con >30 días en revocación
  // (los identificamos por createdAt — si fue revocado, lleva tiempo dado de baja).
  // Para mayor precisión usamos createdAt < hace 30 días + isRevoked = true.
  const demoCutoff = new Date(
    Date.now() - DEMO_TOKEN_REVOKED_GRACE_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const deletedRevoked = await db
    .delete(schema.demoTokens)
    .where(
      and(
        eq(schema.demoTokens.isRevoked, true),
        lt(schema.demoTokens.createdAt, demoCutoff),
      ),
    )
    .returning({ code: schema.demoTokens.code });
  result.revokedDemoTokensDeleted = deletedRevoked.length;

  if (!isR2Configured()) {
    result.skipped = "r2_not_configured";
    return json(result);
  }

  // Capturas rechazadas o con apply_failed con más de 7 días → blobs huérfanos
  const cutoff = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const orphanCaptures = await db
    .select({
      id: schema.pendingCaptures.id,
      state: schema.pendingCaptures.state,
      attachmentsJson: schema.pendingCaptures.attachmentsJson,
    })
    .from(schema.pendingCaptures)
    .where(
      and(
        // SQLite NO tiene IN con tuple, así que filtramos por state en JS
        lt(schema.pendingCaptures.uploadedAt, cutoff),
      ),
    )
    .limit(500);

  result.capturesScanned = orphanCaptures.length;

  for (const cap of orphanCaptures) {
    if (cap.state !== "rejected" && cap.state !== "apply_failed") continue;
    const keys = safeParse<string[]>(cap.attachmentsJson) ?? [];
    for (const k of keys) {
      try {
        await deleteObject(k);
        result.orphansDeleted++;
      } catch (e) {
        console.warn(`[cron/cleanup-r2] no se pudo borrar ${k}:`, e);
      }
    }
  }

  return json(result);
}

function safeParse<T = unknown>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}
