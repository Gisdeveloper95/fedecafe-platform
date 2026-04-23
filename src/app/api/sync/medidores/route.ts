import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db/client";
import { json, parseJson } from "@/lib/api/json";
import { requireAdmin } from "@/lib/auth/principal";

const MedidorInput = z.object({
  contrato: z.string().min(1).max(100),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  usuario: z.string().optional(),
  nombre: z.string().optional(),
  direccion: z.string().optional(),
  municipio: z.string().optional(),
});

const SyncMedidoresRequest = z.object({
  items: z.array(MedidorInput).max(10_000),
  mode: z.enum(["upsert", "replace_all", "replace_by_municipio"]).default("upsert"),
  municipio: z.string().optional(), // requerido si mode = replace_by_municipio
});

export async function POST(request: Request) {
  let admin;
  try {
    admin = await requireAdmin(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  let body: z.infer<typeof SyncMedidoresRequest>;
  try {
    body = await parseJson(request, SyncMedidoresRequest);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  if (body.mode === "replace_by_municipio" && !body.municipio) {
    return new Response(
      JSON.stringify({ error: "municipio_required_for_replace_by_municipio" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  // Estrategia:
  // - replace_all: borra todo y reinserta
  // - replace_by_municipio: borra solo los del municipio y reinserta (solo items de ese municipio)
  // - upsert (default): inserta / actualiza por contrato
  const now = new Date().toISOString();

  if (body.mode === "replace_all") {
    await db.delete(schema.medidores);
  } else if (body.mode === "replace_by_municipio") {
    await db
      .delete(schema.medidores)
      .where(sql`${schema.medidores.municipio} = ${body.municipio}`);
  }

  // Insertar en batches para no pasar limites SQLite
  const BATCH = 200;
  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < body.items.length; i += BATCH) {
    const batch = body.items.slice(i, i + BATCH);
    // Usamos onConflictDoUpdate para upsert real
    const result = await db
      .insert(schema.medidores)
      .values(
        batch.map((m) => ({
          contrato: m.contrato,
          latitude: m.latitude,
          longitude: m.longitude,
          usuario: m.usuario,
          nombre: m.nombre,
          direccion: m.direccion,
          municipio: m.municipio,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: schema.medidores.contrato,
        set: {
          latitude: sql`excluded.latitude`,
          longitude: sql`excluded.longitude`,
          usuario: sql`excluded.usuario`,
          nombre: sql`excluded.nombre`,
          direccion: sql`excluded.direccion`,
          municipio: sql`excluded.municipio`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
      .returning({ contrato: schema.medidores.contrato });

    inserted += result.length;
  }

  await db.insert(schema.auditLog).values({
    id: randomUUID(),
    userId: admin.userId,
    action: "MEDIDORES_SYNC",
    details: JSON.stringify({
      mode: body.mode,
      municipio: body.municipio,
      count: body.items.length,
    }),
  });

  return json({ ok: true, received: body.items.length, processed: inserted, updated });
}
