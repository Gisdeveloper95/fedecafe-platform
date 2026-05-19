import { lt } from "drizzle-orm";

import { db, schema } from "@/db/client";
import { env } from "@/lib/env";
import { json, jsonError } from "@/lib/api/json";

const RECORRIDOS_RETENTION_DAYS = 365; // 1 año

/**
 * Cron: borra recorridos GPS más viejos que 1 año. Los recorridos viejos no
 * son interesantes para reportes operativos y ocupan miles de filas de puntos
 * GPS (tabla `recorrido_puntos` es la que crece más rápido).
 *
 * Cascade: `recorrido_puntos` tiene FK con ON DELETE CASCADE, así que se borran
 * automáticamente con su recorrido padre.
 *
 * Protegido con `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: Request) {
  if (env.CRON_SECRET) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${env.CRON_SECRET}`) {
      return jsonError("forbidden", 403);
    }
  }

  const cutoff = new Date(
    Date.now() - RECORRIDOS_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Contar antes para reportar (más informativo que rowsAffected, que en Turso
  // a veces es 0 por algún quirk del cliente)
  const toDelete = await db
    .select({ id: schema.recorridos.id })
    .from(schema.recorridos)
    .where(lt(schema.recorridos.iniciadoAt, cutoff));

  const count = toDelete.length;
  if (count > 0) {
    await db
      .delete(schema.recorridos)
      .where(lt(schema.recorridos.iniciadoAt, cutoff));
  }

  return json({
    ok: true,
    retentionDays: RECORRIDOS_RETENTION_DAYS,
    cutoff,
    deletedRecorridos: count,
  });
}
