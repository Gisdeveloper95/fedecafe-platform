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
  const rutas = await c.execute(
    `SELECT r.id, r.nombre, r.estado, r.start_point_json IS NOT NULL AS has_start,
            (SELECT count(*) FROM ruta_items ri WHERE ri.ruta_id = r.id) AS items
       FROM rutas r
       ORDER BY r.created_at DESC LIMIT 20`,
  );
  for (const row of rutas.rows) {
    console.log(
      `${row.id} | ${row.nombre} | ${row.estado} | start=${row.has_start} | items=${row.items}`,
    );
  }
  await c.close();
}
main();
