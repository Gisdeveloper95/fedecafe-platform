import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db/client";
import { json, jsonError, parseJson } from "@/lib/api/json";
import { requirePrincipal } from "@/lib/auth/principal";

const UpdateItemRequest = z.object({
  visitado: z.boolean(),
  visitadoAt: z.string().datetime().optional(),
});

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; codigo: string }> },
) {
  let principal;
  try {
    principal = await requirePrincipal(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const { id, codigo } = await ctx.params;

  // Verificar que el usuario puede modificar esta ruta
  const rutaRows = await db
    .select({ operarioId: schema.rutas.operarioId })
    .from(schema.rutas)
    .where(eq(schema.rutas.id, id))
    .limit(1);
  const ruta = rutaRows[0];
  if (!ruta) return jsonError("not_found", 404);

  if (principal.role === "operario" && ruta.operarioId !== principal.userId) {
    return jsonError("forbidden", 403);
  }

  let body: z.infer<typeof UpdateItemRequest>;
  try {
    body = await parseJson(request, UpdateItemRequest);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const now = body.visitadoAt ?? new Date().toISOString();
  await db
    .update(schema.rutaItems)
    .set({
      visitado: body.visitado,
      visitadoAt: body.visitado ? now : null,
    })
    .where(
      and(
        eq(schema.rutaItems.rutaId, id),
        eq(schema.rutaItems.codigo, decodeURIComponent(codigo)),
      ),
    );

  return json({ ok: true });
}
