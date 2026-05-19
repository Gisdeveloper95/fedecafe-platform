import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db/client";
import { logAudit } from "@/lib/audit";
import { json, jsonError, parseJson } from "@/lib/api/json";
import { requireAdmin } from "@/lib/auth/principal";

const UpdateTuberiaRequest = z
  .object({
    layerName: z.string().min(1).optional(),
    material: z.string().nullable().optional(),
    diametro: z.string().nullable().optional(),
    ramal: z.string().nullable().optional(),
    municipio: z.string().nullable().optional(),
    acueducto: z.string().nullable().optional(),
    longitudM: z.number().nonnegative().nullable().optional(),
    centroidLat: z.number().min(-90).max(90).nullable().optional(),
    centroidLon: z.number().min(-180).max(180).nullable().optional(),
    geometryJson: z.string().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "empty_payload" });

export async function GET(
  request: Request,
  ctx: { params: Promise<{ codigo: string }> },
) {
  try {
    await requireAdmin(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
  const { codigo } = await ctx.params;
  const rows = await db
    .select()
    .from(schema.tuberias)
    .where(eq(schema.tuberias.codigo, codigo))
    .limit(1);
  const t = rows[0];
  if (!t) return jsonError("not_found", 404);
  return json({ tuberia: t });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ codigo: string }> },
) {
  let admin;
  try {
    admin = await requireAdmin(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
  const { codigo } = await ctx.params;

  let body: z.infer<typeof UpdateTuberiaRequest>;
  try {
    body = await parseJson(request, UpdateTuberiaRequest);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const existing = await db
    .select({ c: schema.tuberias.codigo })
    .from(schema.tuberias)
    .where(eq(schema.tuberias.codigo, codigo))
    .limit(1);
  if (existing.length === 0) return jsonError("not_found", 404);

  const update: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  for (const k of [
    "layerName",
    "material",
    "diametro",
    "ramal",
    "municipio",
    "acueducto",
    "longitudM",
    "centroidLat",
    "centroidLon",
    "geometryJson",
  ] as const) {
    if (body[k] !== undefined) update[k] = body[k];
  }
  await db
    .update(schema.tuberias)
    .set(update)
    .where(eq(schema.tuberias.codigo, codigo));

  await logAudit({
    userId: admin.userId,
    action: "tuberia.updated",
    targetId: codigo,
    details: update,
  });

  return json({ ok: true, codigo });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ codigo: string }> },
) {
  let admin;
  try {
    admin = await requireAdmin(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
  const { codigo } = await ctx.params;

  const existing = await db
    .select({ c: schema.tuberias.codigo })
    .from(schema.tuberias)
    .where(eq(schema.tuberias.codigo, codigo))
    .limit(1);
  if (existing.length === 0) return jsonError("not_found", 404);

  await db.delete(schema.tuberias).where(eq(schema.tuberias.codigo, codigo));

  await logAudit({
    userId: admin.userId,
    action: "tuberia.deleted",
    targetId: codigo,
  });

  return json({ ok: true, codigo });
}
