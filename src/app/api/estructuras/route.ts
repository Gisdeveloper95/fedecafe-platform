import { and, asc, like, or, sql } from "drizzle-orm";

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
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "100", 10), 1),
    1000,
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
    where.push(sql`${schema.estructuras.municipio} = ${municipio}`);
  }

  const rows = await db
    .select()
    .from(schema.estructuras)
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(asc(schema.estructuras.layerName), asc(schema.estructuras.codigo))
    .limit(limit);

  const countRow = await db
    .select({ total: sql<number>`count(*)` })
    .from(schema.estructuras);

  return json({ estructuras: rows, totalInDb: Number(countRow[0]?.total ?? 0) });
}
