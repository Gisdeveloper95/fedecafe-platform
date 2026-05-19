import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { json } from "@/lib/api/json";
import { requirePrincipal } from "@/lib/auth/principal";

/**
 * Municipios distintos presentes en las entidades GIS. Colapsa variantes
 * (mayúsculas/minúsculas + trailing spaces) para evitar la lista fea de
 * "ARMENIA", "ARMENIA   ", "Armenia" como entradas distintas.
 */
export async function GET(request: Request) {
  try {
    await requirePrincipal(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const rows = await db.all<{ municipio: string; n: number }>(
    sql`
      SELECT UPPER(TRIM(municipio)) AS municipio, SUM(n) AS n FROM (
        SELECT municipio, COUNT(*) AS n FROM medidores
          WHERE municipio IS NOT NULL AND TRIM(municipio) != ''
          GROUP BY municipio
        UNION ALL
        SELECT municipio, COUNT(*) AS n FROM estructuras
          WHERE municipio IS NOT NULL AND TRIM(municipio) != ''
          GROUP BY municipio
        UNION ALL
        SELECT municipio, COUNT(*) AS n FROM tuberias
          WHERE municipio IS NOT NULL AND TRIM(municipio) != ''
          GROUP BY municipio
      )
      GROUP BY UPPER(TRIM(municipio))
      ORDER BY UPPER(TRIM(municipio)) ASC
    `,
  );

  return json({
    municipios: rows.map((r) => ({ nombre: r.municipio, total: Number(r.n) })),
  });
}
