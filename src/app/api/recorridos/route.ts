import { randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db/client";
import { json, jsonError, parseJson } from "@/lib/api/json";
import { requirePrincipal } from "@/lib/auth/principal";

const PuntoInput = z.object({
  timestamp: z.string().datetime(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  velocidadMs: z.number().optional(),
  precisionM: z.number().optional(),
  bateriaPct: z.number().int().min(0).max(100).optional(),
});

const UploadRecorridoRequest = z.object({
  rutaId: z.string().uuid().nullable().optional(),
  iniciadoAt: z.string().datetime(),
  finalizadoAt: z.string().datetime(),
  distanciaTotalM: z.number().optional(),
  duracionSegundos: z.number().int().optional(),
  puntos: z.array(PuntoInput).min(1).max(20_000),
});

export async function GET(request: Request) {
  let principal;
  try {
    principal = await requirePrincipal(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") ?? "auto";

  let operarioFilter: string | null = null;
  if (principal.role === "operario" || scope === "mios") {
    operarioFilter = principal.userId;
  }

  const where = [];
  if (operarioFilter) where.push(eq(schema.recorridos.operarioId, operarioFilter));

  const rows = await db
    .select()
    .from(schema.recorridos)
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(desc(schema.recorridos.iniciadoAt))
    .limit(200);

  return json({ recorridos: rows });
}

export async function POST(request: Request) {
  let principal;
  try {
    principal = await requirePrincipal(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  let body: z.infer<typeof UploadRecorridoRequest>;
  try {
    body = await parseJson(request, UploadRecorridoRequest);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  // Si viene rutaId, validar que pertenezca al operario
  if (body.rutaId) {
    const rutaRows = await db
      .select({ operarioId: schema.rutas.operarioId })
      .from(schema.rutas)
      .where(eq(schema.rutas.id, body.rutaId))
      .limit(1);
    const ruta = rutaRows[0];
    if (!ruta) return jsonError("ruta_not_found", 404);
    if (ruta.operarioId !== principal.userId && principal.role !== "admin") {
      return jsonError("forbidden", 403);
    }
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  await db.insert(schema.recorridos).values({
    id,
    operarioId: principal.userId,
    rutaId: body.rutaId ?? null,
    iniciadoAt: body.iniciadoAt,
    finalizadoAt: body.finalizadoAt,
    distanciaTotalM: body.distanciaTotalM,
    duracionSegundos: body.duracionSegundos,
    subidoAt: now,
  });

  // Puntos en batches (SQLite tiene limite ~999 params por insert)
  const BATCH = 100;
  for (let i = 0; i < body.puntos.length; i += BATCH) {
    const batch = body.puntos.slice(i, i + BATCH).map((p) => ({
      recorridoId: id,
      timestamp: p.timestamp,
      latitude: p.latitude,
      longitude: p.longitude,
      velocidadMs: p.velocidadMs,
      precisionM: p.precisionM,
      bateriaPct: p.bateriaPct,
    }));
    await db.insert(schema.recorridoPuntos).values(batch);
  }

  await db.insert(schema.auditLog).values({
    id: randomUUID(),
    userId: principal.userId,
    action: "RECORRIDO_UPLOADED",
    targetId: id,
    details: JSON.stringify({
      puntos: body.puntos.length,
      duracionSegundos: body.duracionSegundos,
      distanciaTotalM: body.distanciaTotalM,
    }),
  });

  return json({ recorrido: { id, puntos: body.puntos.length } }, { status: 201 });
}
