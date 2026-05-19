import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { json } from "@/lib/api/json";
import { requirePrincipal } from "@/lib/auth/principal";

/**
 * Devuelve listas distintas de metadatos de tuberías para alimentar filtros:
 * layers, materiales, diámetros, municipios.
 */
export async function GET(request: Request) {
  try {
    await requirePrincipal(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const [layers, materiales, diametros, municipios] = await Promise.all([
    db.all<{ v: string; n: number }>(sql`
      SELECT layer_name as v, COUNT(*) as n FROM tuberias
      WHERE layer_name IS NOT NULL AND TRIM(layer_name) != ''
      GROUP BY layer_name ORDER BY layer_name ASC
    `),
    db.all<{ v: string; n: number }>(sql`
      SELECT material as v, COUNT(*) as n FROM tuberias
      WHERE material IS NOT NULL AND TRIM(material) != ''
      GROUP BY material ORDER BY material ASC
    `),
    db.all<{ v: string; n: number }>(sql`
      SELECT diametro as v, COUNT(*) as n FROM tuberias
      WHERE diametro IS NOT NULL AND TRIM(diametro) != ''
      GROUP BY diametro ORDER BY diametro ASC
    `),
    db.all<{ v: string; n: number }>(sql`
      SELECT UPPER(TRIM(municipio)) as v, COUNT(*) as n FROM tuberias
      WHERE municipio IS NOT NULL AND TRIM(municipio) != ''
      GROUP BY UPPER(TRIM(municipio)) ORDER BY UPPER(TRIM(municipio)) ASC
    `),
  ]);

  return json({
    layers: layers.map((x) => ({ nombre: x.v, total: Number(x.n) })),
    materiales: materiales.map((x) => ({ nombre: x.v, total: Number(x.n) })),
    diametros: diametros.map((x) => ({ nombre: x.v, total: Number(x.n) })),
    municipios: municipios.map((x) => ({ nombre: x.v, total: Number(x.n) })),
  });
}
