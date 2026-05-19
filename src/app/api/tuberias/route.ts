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
        like(schema.tuberias.codigo, `%${q}%`),
        like(schema.tuberias.material, `%${q}%`),
        like(schema.tuberias.ramal, `%${q}%`),
      ),
    );
  }
  if (layer) {
    where.push(sql`${schema.tuberias.layerName} = ${layer}`);
  }
  if (municipio) {
    where.push(sql`${schema.tuberias.municipio} = ${municipio}`);
  }
  if (since) {
    where.push(gt(schema.tuberias.updatedAt, since));
  }

  const orderColumn = since
    ? schema.tuberias.updatedAt
    : schema.tuberias.codigo;

  const rows = await db
    .select()
    .from(schema.tuberias)
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(asc(orderColumn))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextSince =
    hasMore && since ? items[items.length - 1]?.updatedAt ?? null : null;

  const countRow = await db
    .select({ total: sql<number>`count(*)` })
    .from(schema.tuberias);

  return json({
    tuberias: items,
    totalInDb: Number(countRow[0]?.total ?? 0),
    hasMore,
    nextSince,
    serverTime: new Date().toISOString(),
  });
}
