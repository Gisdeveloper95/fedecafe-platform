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

  if (principal.role === "operario" && ruta.operarioId !== principal.userId) {
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
    ruta,
    items: items.map((it) => ({
      codigo: it.codigo,
      orden: it.orden,
      visitado: it.visitado,
      visitadoAt: it.visitadoAt,
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

  // Operario solo puede cambiar estado/notas de sus rutas
  if (principal.role === "operario") {
    if (ruta.operarioId !== principal.userId) return jsonError("forbidden", 403);
  }

  let body: z.infer<typeof UpdateRutaRequest>;
  try {
    body = await parseJson(request, UpdateRutaRequest);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const now = new Date().toISOString();
  await db
    .update(schema.rutas)
    .set({
      ...(body.nombre !== undefined ? { nombre: body.nombre } : {}),
      ...(body.estado !== undefined ? { estado: body.estado } : {}),
      ...(body.notas !== undefined ? { notas: body.notas } : {}),
      updatedAt: now,
    })
    .where(eq(schema.rutas.id, id));

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
