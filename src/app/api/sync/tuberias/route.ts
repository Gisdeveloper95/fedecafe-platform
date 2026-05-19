import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db/client";
import { json, parseJson } from "@/lib/api/json";
import { requireAdmin } from "@/lib/auth/principal";

const TuberiaInput = z.object({
  codigo: z.string().min(1).max(100),
  layerName: z.string().min(1).max(100),
  material: z.string().optional(),
  diametro: z.string().optional(),
  ramal: z.string().optional(),
  municipio: z.string().optional(),
  acueducto: z.string().optional(),
  longitudM: z.number().nonnegative().optional(),
  centroidLat: z.number().min(-90).max(90).optional(),
  centroidLon: z.number().min(-180).max(180).optional(),
  geometryJson: z.string().optional(), // GeoJSON LineString
});

const SyncTuberiasRequest = z.object({
  items: z.array(TuberiaInput).max(10_000),
  mode: z.enum(["upsert", "replace_all", "replace_by_layer"]).default("upsert"),
  layerName: z.string().optional(),
});

export async function POST(request: Request) {
  let admin;
  try {
    admin = await requireAdmin(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  let body: z.infer<typeof SyncTuberiasRequest>;
  try {
    body = await parseJson(request, SyncTuberiasRequest);
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
    await db.delete(schema.tuberias);
  } else if (body.mode === "replace_by_layer") {
    await db
      .delete(schema.tuberias)
      .where(sql`${schema.tuberias.layerName} = ${body.layerName}`);
  }

  const BATCH = 200;
  let processed = 0;

  for (let i = 0; i < body.items.length; i += BATCH) {
    const batch = body.items.slice(i, i + BATCH);
    const result = await db
      .insert(schema.tuberias)
      .values(
        batch.map((t) => ({
          codigo: t.codigo,
          layerName: t.layerName,
          material: t.material,
          diametro: t.diametro,
          ramal: t.ramal,
          municipio: t.municipio,
          acueducto: t.acueducto,
          longitudM: t.longitudM,
          centroidLat: t.centroidLat,
          centroidLon: t.centroidLon,
          geometryJson: t.geometryJson,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: schema.tuberias.codigo,
        set: {
          layerName: sql`excluded.layer_name`,
          material: sql`excluded.material`,
          diametro: sql`excluded.diametro`,
          ramal: sql`excluded.ramal`,
          municipio: sql`excluded.municipio`,
          acueducto: sql`excluded.acueducto`,
          longitudM: sql`excluded.longitud_m`,
          centroidLat: sql`excluded.centroid_lat`,
          centroidLon: sql`excluded.centroid_lon`,
          geometryJson: sql`excluded.geometry_json`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
      .returning({ codigo: schema.tuberias.codigo });

    processed += result.length;
  }

  await db.insert(schema.auditLog).values({
    id: randomUUID(),
    userId: admin.userId,
    action: "TUBERIAS_SYNC",
    details: JSON.stringify({
      mode: body.mode,
      layerName: body.layerName,
      count: body.items.length,
    }),
  });

  return json({ ok: true, received: body.items.length, processed });
}
