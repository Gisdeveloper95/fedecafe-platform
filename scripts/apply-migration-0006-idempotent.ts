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

  async function existingCols(table: string): Promise<Set<string>> {
    const r = await client.execute(`PRAGMA table_info("${table}")`);
    return new Set(r.rows.map((row) => String(row.name)));
  }

  const adds: Array<{ table: string; col: string; type: string }> = [
    { table: "ruta_items", col: "kind", type: "text" },
    { table: "ruta_items", col: "wp_lat", type: "real" },
    { table: "ruta_items", col: "wp_lon", type: "real" },
    { table: "ruta_items", col: "wp_label", type: "text" },
    { table: "rutas", col: "start_point_json", type: "text" },
  ];

  const tables = new Set(adds.map((a) => a.table));
  const cols = new Map<string, Set<string>>();
  for (const t of tables) cols.set(t, await existingCols(t));

  for (const { table, col, type } of adds) {
    if (cols.get(table)!.has(col)) {
      console.log(`= ${table}.${col} ya existe`);
      continue;
    }
    const stmt = `ALTER TABLE "${table}" ADD "${col}" ${type}`;
    console.log(`+ ${stmt}`);
    await client.execute(stmt);
  }
  console.log("[OK] Migración 0006 idempotente completada");
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
