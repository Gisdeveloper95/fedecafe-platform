import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db/client";
import { json, jsonError, parseJson } from "@/lib/api/json";
import { requireAdmin, requirePrincipal } from "@/lib/auth/principal";

const UpdateRutaRequest = z.object({
  nombre: z.string().min(1).max(200).optional(),
  estado: z.enum(["pendiente", "en_curso", "completada", "archivada"]).optional(),
  notas: z.string().max(1000).optional(),
  fechaObjetivo: z.string().date().nullable().optional(),
  /// Reemplazar la lista de operarios asignados (drop+insert)
  operarioIds: z.array(z.string().uuid()).min(1).max(20).optional(),
  /// Reemplazar la lista completa de items (drop+insert). Si se pasa, los
  /// items previos se borran.
  items: z
    .array(
      z.discriminatedUnion("kind", [
        z.object({
          kind: z.literal("entity"),
          codigo: z.string().min(1),
        }),
        z.object({
          kind: z.literal("waypoint"),
          codigo: z.string().min(1),
          lat: z.number().min(-90).max(90),
          lon: z.number().min(-180).max(180),
          label: z.string().max(120).optional(),
        }),
      ]),
    )
    .min(1)
    .max(500)
    .optional(),
  startPoint: z
    .object({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      label: z.string().optional(),
      favoriteId: z.string().optional(),
    })
    .nullable()
    .optional(),
});

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  let principal;
  try {
    principal = await requirePrincipal(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const { id } = await ctx.params;

  const rutaRows = await db
    .select()
    .from(schema.rutas)
    .where(eq(schema.rutas.id, id))
    .limit(1);
  const ruta = rutaRows[0];
  if (!ruta) return jsonError("not_found", 404);

  // Lista de operarios asignados (multi-asignación)
  const assigneeRows = await db
    .select({ operarioId: schema.rutaAssignees.operarioId })
    .from(schema.rutaAssignees)
    .where(eq(schema.rutaAssignees.rutaId, id));
  const operarioIds = assigneeRows.map((r) => r.operarioId);
  const allOperarioIds =
    operarioIds.length > 0 ? operarioIds : [ruta.operarioId];

  if (
    principal.role === "operario" &&
    !allOperarioIds.includes(principal.userId)
  ) {
    return jsonError("forbidden", 403);
  }

  const items = await db
    .select()
    .from(schema.rutaItems)
    .where(eq(schema.rutaItems.rutaId, id))
    .orderBy(asc(schema.rutaItems.orden));

  // Resolver coordenadas de cada item segun el tipo de ruta
  const codes = items.map((i) => i.codigo);
  let puntos: Record<string, { lat: number; lng: number; info: Record<string, unknown> }> =
    {};

  if (codes.length > 0) {
    if (ruta.tipo === "medidores") {
      const rows = await db
        .select()
        .from(schema.medidores)
        .where(inArray(schema.medidores.contrato, codes));
      puntos = Object.fromEntries(
        rows.map((m) => [
          m.contrato,
          {
            lat: m.latitude,
            lng: m.longitude,
            info: {
              usuario: m.usuario,
              nombre: m.nombre,
              direccion: m.direccion,
              municipio: m.municipio,
            },
          },
        ]),
      );
    } else {
      const rows = await db
        .select()
        .from(schema.estructuras)
        .where(inArray(schema.estructuras.codigo, codes));
      puntos = Object.fromEntries(
        rows.map((e) => [
          e.codigo,
          {
            lat: e.latitude,
            lng: e.longitude,
            info: {
              layerName: e.layerName,
              nombre: e.nombre,
              ramal: e.ramal,
              municipio: e.municipio,
            },
          },
        ]),
      );
    }
  }

  return json({
    ruta: {
      ...ruta,
      operarioIds: allOperarioIds,
      startPoint: ruta.startPointJson ? JSON.parse(ruta.startPointJson) : null,
    },
    items: items.map((it) => ({
      codigo: it.codigo,
      kind: it.kind,
      orden: it.orden,
      visitado: it.visitado,
      visitadoAt: it.visitadoAt,
      wpLat: it.wpLat,
      wpLon: it.wpLon,
      wpLabel: it.wpLabel,
      coordenadas: puntos[it.codigo] ?? null,
    })),
  });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  let principal;
  try {
    principal = await requirePrincipal(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const { id } = await ctx.params;

  const rutaRows = await db
    .select()
    .from(schema.rutas)
    .where(eq(schema.rutas.id, id))
    .limit(1);
  const ruta = rutaRows[0];
  if (!ruta) return jsonError("not_found", 404);

  // Operario solo puede cambiar estado/notas; admin/developer todo.
  const isOperario = principal.role === "operario";
  if (isOperario) {
    if (ruta.operarioId !== principal.userId) return jsonError("forbidden", 403);
  }

  let body: z.infer<typeof UpdateRutaRequest>;
  try {
    body = await parseJson(request, UpdateRutaRequest);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  // Operarios no pueden tocar items/operarioIds/startPoint
  if (
    isOperario &&
    (body.items || body.operarioIds || body.startPoint !== undefined ||
      body.fechaObjetivo !== undefined || body.nombre)
  ) {
    return jsonError("operario_cannot_edit_those_fields", 403);
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updatedAt: now };
  if (body.nombre !== undefined) updates.nombre = body.nombre;
  if (body.estado !== undefined) updates.estado = body.estado;
  if (body.notas !== undefined) updates.notas = body.notas;
  if (body.fechaObjetivo !== undefined) updates.fechaObjetivo = body.fechaObjetivo;
  if (body.startPoint !== undefined) {
    updates.startPointJson = body.startPoint
      ? JSON.stringify(body.startPoint)
      : null;
  }
  if (body.operarioIds && body.operarioIds.length > 0) {
    updates.operarioId = body.operarioIds[0];
  }

  await db.update(schema.rutas).set(updates).where(eq(schema.rutas.id, id));

  // Reemplazar lista de assignees si vino operarioIds
  if (body.operarioIds && body.operarioIds.length > 0) {
    const uniqueIds = Array.from(new Set(body.operarioIds));
    // Verificar operarios existen y activos
    const operarioRows = await db
      .select()
      .from(schema.users)
      .where(inArray(schema.users.id, uniqueIds));
    if (operarioRows.length !== uniqueIds.length) {
      return jsonError("operario_not_found", 400);
    }
    if (operarioRows.find((u) => u.status !== "active")) {
      return jsonError("operario_inactive", 400);
    }
    await db
      .delete(schema.rutaAssignees)
      .where(eq(schema.rutaAssignees.rutaId, id));
    await db.insert(schema.rutaAssignees).values(
      uniqueIds.map((operarioId) => ({
        rutaId: id,
        operarioId,
        asignadoAt: now,
      })),
    );
  }

  // Reemplazar items si vino la lista
  if (body.items) {
    await db
      .delete(schema.rutaItems)
      .where(eq(schema.rutaItems.rutaId, id));
    const itemRows = body.items.map((it, idx) => {
      if (it.kind === "entity") {
        return {
          rutaId: id,
          codigo: it.codigo,
          kind: "entity" as const,
          orden: idx,
          visitado: false,
        };
      }
      return {
        rutaId: id,
        codigo: it.codigo,
        kind: "waypoint" as const,
        orden: idx,
        visitado: false,
        wpLat: it.lat,
        wpLon: it.lon,
        wpLabel: it.label ?? null,
      };
    });
    // Insert in batches
    const BATCH = 200;
    for (let i = 0; i < itemRows.length; i += BATCH) {
      await db
        .insert(schema.rutaItems)
        .values(itemRows.slice(i, i + BATCH));
    }
  }

  await db.insert(schema.auditLog).values({
    id: randomUUID(),
    userId: principal.userId,
    action: "RUTA_UPDATED",
    targetId: id,
    details: JSON.stringify({
      fields: Object.keys(updates).filter((k) => k !== "updatedAt"),
      itemsChanged: !!body.items,
      operariosChanged: !!body.operarioIds,
    }),
  });

  return json({ ok: true });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  let admin;
  try {
    admin = await requireAdmin(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const { id } = await ctx.params;
  await db.delete(schema.rutas).where(eq(schema.rutas.id, id));

  await db.insert(schema.auditLog).values({
    id: randomUUID(),
    userId: admin.userId,
    action: "RUTA_DELETED",
    targetId: id,
  });

  return json({ ok: true });
}
