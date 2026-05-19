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
  const r = await c.execute(
    "SELECT codigo, material, longitud_m, centroid_lat, centroid_lon FROM tuberias LIMIT 8",
  );
  for (const row of r.rows) console.log(row);
  const cn = await c.execute(
    "SELECT count(*) c FROM tuberias WHERE centroid_lat IS NULL OR centroid_lon IS NULL",
  );
  console.log("tuberias sin centroide:", cn.rows[0].c);
  await c.close();
}
main();
