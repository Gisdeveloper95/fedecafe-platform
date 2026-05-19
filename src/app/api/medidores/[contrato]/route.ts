import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db/client";
import { logAudit } from "@/lib/audit";
import { json, jsonError, parseJson } from "@/lib/api/json";
import { requireAdmin } from "@/lib/auth/principal";

const UpdateMedidorRequest = z
  .object({
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    nombre: z.string().nullable().optional(),
    direccion: z.string().nullable().optional(),
    municipio: z.string().nullable().optional(),
    usuario: z.string().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "empty_payload" });

export async function GET(
  request: Request,
  ctx: { params: Promise<{ contrato: string }> },
) {
  try {
    await requireAdmin(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
  const { contrato } = await ctx.params;
  const rows = await db
    .select()
    .from(schema.medidores)
    .where(eq(schema.medidores.contrato, contrato))
    .limit(1);
  const m = rows[0];
  if (!m) return jsonError("not_found", 404);
  return json({ medidor: m });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ contrato: string }> },
) {
  let admin;
  try {
    admin = await requireAdmin(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
  const { contrato } = await ctx.params;

  let body: z.infer<typeof UpdateMedidorRequest>;
  try {
    body = await parseJson(request, UpdateMedidorRequest);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const existing = await db
    .select({ c: schema.medidores.contrato })
    .from(schema.medidores)
    .where(eq(schema.medidores.contrato, contrato))
    .limit(1);
  if (existing.length === 0) return jsonError("not_found", 404);

  const update: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  for (const k of [
    "latitude",
    "longitude",
    "nombre",
    "direccion",
    "municipio",
    "usuario",
  ] as const) {
    if (body[k] !== undefined) update[k] = body[k];
  }
  await db
    .update(schema.medidores)
    .set(update)
    .where(eq(schema.medidores.contrato, contrato));

  await logAudit({
    userId: admin.userId,
    action: "medidor.updated",
    targetId: contrato,
    details: update,
  });

  return json({ ok: true, contrato });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ contrato: string }> },
) {
  let admin;
  try {
    admin = await requireAdmin(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
  const { contrato } = await ctx.params;

  const existing = await db
    .select({ c: schema.medidores.contrato })
    .from(schema.medidores)
    .where(eq(schema.medidores.contrato, contrato))
    .limit(1);
  if (existing.length === 0) return jsonError("not_found", 404);

  await db
    .delete(schema.medidores)
    .where(eq(schema.medidores.contrato, contrato));

  await logAudit({
    userId: admin.userId,
    action: "medidor.deleted",
    targetId: contrato,
  });

  return json({ ok: true, contrato });
}
