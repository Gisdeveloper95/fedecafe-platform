import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db/client";
import { logAudit } from "@/lib/audit";
import { json, jsonError, parseJson } from "@/lib/api/json";
import { requireAdmin } from "@/lib/auth/principal";

const UpdateEstructuraRequest = z
  .object({
    layerName: z.string().min(1).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    nombre: z.string().nullable().optional(),
    ramal: z.string().nullable().optional(),
    tipo: z.string().nullable().optional(),
    estado: z.string().nullable().optional(),
    municipio: z.string().nullable().optional(),
    acueducto: z.string().nullable().optional(),
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
    .from(schema.estructuras)
    .where(eq(schema.estructuras.codigo, codigo))
    .limit(1);
  const e = rows[0];
  if (!e) return jsonError("not_found", 404);
  return json({ estructura: e });
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

  let body: z.infer<typeof UpdateEstructuraRequest>;
  try {
    body = await parseJson(request, UpdateEstructuraRequest);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const existing = await db
    .select({ c: schema.estructuras.codigo })
    .from(schema.estructuras)
    .where(eq(schema.estructuras.codigo, codigo))
    .limit(1);
  if (existing.length === 0) return jsonError("not_found", 404);

  const update: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  for (const k of [
    "layerName",
    "latitude",
    "longitude",
    "nombre",
    "ramal",
    "tipo",
    "estado",
    "municipio",
    "acueducto",
  ] as const) {
    if (body[k] !== undefined) update[k] = body[k];
  }
  await db
    .update(schema.estructuras)
    .set(update)
    .where(eq(schema.estructuras.codigo, codigo));

  await logAudit({
    userId: admin.userId,
    action: "estructura.updated",
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
    .select({ c: schema.estructuras.codigo })
    .from(schema.estructuras)
    .where(eq(schema.estructuras.codigo, codigo))
    .limit(1);
  if (existing.length === 0) return jsonError("not_found", 404);

  await db
    .delete(schema.estructuras)
    .where(eq(schema.estructuras.codigo, codigo));

  await logAudit({
    userId: admin.userId,
    action: "estructura.deleted",
    targetId: codigo,
  });

  return json({ ok: true, codigo });
}
