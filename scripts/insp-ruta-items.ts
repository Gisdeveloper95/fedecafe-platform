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
  const c = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
  for (const id of [
    "6c3cfd9d-c70a-4bd4-9e4f-b6cb6d2635a9",
    "4a9520a1-30cc-4e48-9843-fa908511d3ff",
  ]) {
    console.log(`Ruta ${id}`);
    const r = await c.execute({
      sql: `SELECT ri.codigo, ri.kind, ri.wp_lat, ri.wp_lon,
                   m.latitude AS mlat, e.latitude AS elat
              FROM ruta_items ri
              LEFT JOIN medidores m ON ri.kind = 'entity' AND m.contrato = ri.codigo
              LEFT JOIN estructuras e ON ri.kind = 'entity' AND e.codigo = ri.codigo
              WHERE ri.ruta_id = ?
              ORDER BY ri.orden ASC`,
      args: [id],
    });
    for (const row of r.rows) console.log("  ", row);
  }
  await c.close();
}
main();
