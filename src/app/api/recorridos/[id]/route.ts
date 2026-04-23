import { asc, eq } from "drizzle-orm";

import { db, schema } from "@/db/client";
import { json, jsonError } from "@/lib/api/json";
import { requirePrincipal } from "@/lib/auth/principal";

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
  const rows = await db
    .select()
    .from(schema.recorridos)
    .where(eq(schema.recorridos.id, id))
    .limit(1);
  const recorrido = rows[0];
  if (!recorrido) return jsonError("not_found", 404);

  if (principal.role === "operario" && recorrido.operarioId !== principal.userId) {
    return jsonError("forbidden", 403);
  }

  const puntos = await db
    .select()
    .from(schema.recorridoPuntos)
    .where(eq(schema.recorridoPuntos.recorridoId, id))
    .orderBy(asc(schema.recorridoPuntos.timestamp));

  return json({ recorrido, puntos });
}
