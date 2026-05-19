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
  const layer = url.searchParams.get("layer")?.trim() ?? "";
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
        like(schema.estructuras.codigo, `%${q}%`),
        like(schema.estructuras.nombre, `%${q}%`),
        like(schema.estructuras.ramal, `%${q}%`),
      ),
    );
  }
  if (layer) {
    where.push(sql`${schema.estructuras.layerName} = ${layer}`);
  }
  if (municipio) {
    // Match tolerante a espacios y mayúsculas/minúsculas
    where.push(
      sql`LOWER(TRIM(${schema.estructuras.municipio})) = LOWER(TRIM(${municipio}))`,
    );
  }
  if (since) {
    where.push(gt(schema.estructuras.updatedAt, since));
  }

  const orderColumn = since
    ? schema.estructuras.updatedAt
    : schema.estructuras.codigo;

  const rows = await db
    .select()
    .from(schema.estructuras)
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(asc(orderColumn))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextSince =
    hasMore && since ? items[items.length - 1]?.updatedAt ?? null : null;

  const countRow = await db
    .select({ total: sql<number>`count(*)` })
    .from(schema.estructuras);

  return json({
    estructuras: items,
    totalInDb: Number(countRow[0]?.total ?? 0),
    hasMore,
    nextSince,
    serverTime: new Date().toISOString(),
  });
}
