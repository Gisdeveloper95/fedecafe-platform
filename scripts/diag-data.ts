/**
 * Diagnóstico rápido: cuántas filas hay y qué pinta tiene la geometría.
 * Útil para entender por qué el visor muestra 0 features cuando hay 234 rows.
 */
import { readFileSync } from "node:fs";

try {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

import { createClient } from "@libsql/client";

async function main() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });

  console.log("=== CONTEOS ===");
  for (const t of ["medidores", "estructuras", "tuberias"]) {
    const r = await client.execute(`SELECT count(*) c FROM ${t}`);
    console.log(`${t}: ${r.rows[0].c}`);
  }

  console.log("\n=== TUBERÍAS: muestra de geometry_json ===");
  const tubs = await client.execute(
    "SELECT codigo, material, layer_name, " +
      "CASE WHEN geometry_json IS NULL THEN 'NULL' ELSE substr(geometry_json,1,140) END AS geo, " +
      "length(geometry_json) AS bytes " +
      "FROM tuberias LIMIT 5",
  );
  for (const row of tubs.rows) {
    console.log(`  ${row.codigo} [${row.material}/${row.layer_name}] bytes=${row.bytes}`);
    console.log(`    ${row.geo}`);
  }

  console.log("\n=== TUBERÍAS con geometry NULL ===");
  const nulls = await client.execute(
    "SELECT count(*) c FROM tuberias WHERE geometry_json IS NULL OR geometry_json = ''",
  );
  console.log(`Filas sin geometry_json: ${nulls.rows[0].c}`);

  console.log("\n=== MEDIDORES: muestra ===");
  const meds = await client.execute(
    "SELECT contrato, nombre, municipio, latitude, longitude FROM medidores LIMIT 5",
  );
  for (const row of meds.rows) {
    console.log(`  ${row.contrato} | ${row.nombre} | ${row.municipio} | (${row.latitude}, ${row.longitude})`);
  }

  console.log("\n=== MEDIDORES por municipio (top 10) ===");
  const munMed = await client.execute(
    "SELECT municipio, count(*) c FROM medidores GROUP BY municipio ORDER BY c DESC LIMIT 10",
  );
  for (const row of munMed.rows) {
    console.log(`  ${row.municipio ?? '(null)'}: ${row.c}`);
  }

  console.log("\n=== ESTRUCTURAS: muestra ===");
  const ests = await client.execute(
    "SELECT codigo, layer_name, municipio, latitude, longitude FROM estructuras LIMIT 5",
  );
  for (const row of ests.rows) {
    console.log(`  ${row.codigo} [${row.layer_name}] | ${row.municipio} | (${row.latitude}, ${row.longitude})`);
  }

  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
