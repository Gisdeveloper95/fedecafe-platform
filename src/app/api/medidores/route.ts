import { and, asc, gt, like, or, sql } from "drizzle-orm";

import { db, schema } from "@/db/client";
import { json } from "@/lib/api/json";
import { requirePrincipal } from "@/lib/auth/principal";

export async function GET(request: Request) {
  try {
    await requirePrincipal(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const municipio = url.searchParams.get("municipio")?.trim() ?? "";
  const since = url.searchParams.get("since")?.trim() ?? "";
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "500", 10), 1),
    2000,
  );

  const where = [];
  if (q) {
    where.push(
      or(
        like(schema.medidores.contrato, `%${q}%`),
        like(schema.medidores.nombre, `%${q}%`),
        like(schema.medidores.usuario, `%${q}%`),
      ),
    );
  }
  if (municipio) {
    where.push(sql`${schema.medidores.municipio} = ${municipio}`);
  }
  if (since) {
    // Sync delta: solo registros modificados después de este timestamp
    where.push(gt(schema.medidores.updatedAt, since));
  }

  // Cuando se sincroniza incrementalmente, ordenar por updated_at para que
  // el cliente pueda usar el último valor como nuevo "since" en la siguiente página.
  const orderColumn = since
    ? schema.medidores.updatedAt
    : schema.medidores.contrato;

  const rows = await db
    .select()
    .from(schema.medidores)
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(asc(orderColumn))
    .limit(limit + 1); // pedimos +1 para saber si hay más

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextSince =
    hasMore && since
      ? items[items.length - 1]?.updatedAt ?? null
      : null;

  const countRow = await db
    .select({ total: sql<number>`count(*)` })
    .from(schema.medidores);

  return json({
    medidores: items,
    totalInDb: Number(countRow[0]?.total ?? 0),
    hasMore,
    nextSince,
    serverTime: new Date().toISOString(),
  });
}
