import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db/client";
import { json, parseJson } from "@/lib/api/json";
import { requireAdmin } from "@/lib/auth/principal";

const EstructuraInput = z.object({
  codigo: z.string().min(1).max(100),
  layerName: z.string().min(1).max(100),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  ramal: z.string().optional(),
  nombre: z.string().optional(),
  tipo: z.string().optional(),
  estado: z.string().optional(),
  municipio: z.string().optional(),
  acueducto: z.string().optional(),
});

const SyncEstructurasRequest = z.object({
  items: z.array(EstructuraInput).max(10_000),
  mode: z.enum(["upsert", "replace_all", "replace_by_layer"]).default("upsert"),
  layerName: z.string().optional(), // requerido si mode = replace_by_layer
});

export async function POST(request: Request) {
  let admin;
  try {
    admin = await requireAdmin(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  let body: z.infer<typeof SyncEstructurasRequest>;
  try {
    body = await parseJson(request, SyncEstructurasRequest);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  if (body.mode === "replace_by_layer" && !body.layerName) {
    return new Response(
      JSON.stringify({ error: "layerName_required_for_replace_by_layer" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const now = new Date().toISOString();

  if (body.mode === "replace_all") {
    await db.delete(schema.estructuras);
  } else if (body.mode === "replace_by_layer") {
    await db
      .delete(schema.estructuras)
      .where(sql`${schema.estructuras.layerName} = ${body.layerName}`);
  }

  const BATCH = 200;
  let processed = 0;

  for (let i = 0; i < body.items.length; i += BATCH) {
    const batch = body.items.slice(i, i + BATCH);
    const result = await db
      .insert(schema.estructuras)
      .values(
        batch.map((e) => ({
          codigo: e.codigo,
          layerName: e.layerName,
          latitude: e.latitude,
          longitude: e.longitude,
          ramal: e.ramal,
          nombre: e.nombre,
          tipo: e.tipo,
          estado: e.estado,
          municipio: e.municipio,
          acueducto: e.acueducto,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: schema.estructuras.codigo,
        set: {
          layerName: sql`excluded.layer_name`,
          latitude: sql`excluded.latitude`,
          longitude: sql`excluded.longitude`,
          ramal: sql`excluded.ramal`,
          nombre: sql`excluded.nombre`,
          tipo: sql`excluded.tipo`,
          estado: sql`excluded.estado`,
          municipio: sql`excluded.municipio`,
          acueducto: sql`excluded.acueducto`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
      .returning({ codigo: schema.estructuras.codigo });

    processed += result.length;
  }

  await db.insert(schema.auditLog).values({
    id: randomUUID(),
    userId: admin.userId,
    action: "ESTRUCTURAS_SYNC",
    details: JSON.stringify({
      mode: body.mode,
      layerName: body.layerName,
      count: body.items.length,
    }),
  });

  return json({ ok: true, received: body.items.length, processed });
}
