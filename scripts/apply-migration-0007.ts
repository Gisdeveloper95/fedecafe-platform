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

  // Check si tabla ya existe (idempotente)
  const existing = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='ruta_assignees'",
  );
  if (existing.rows.length > 0) {
    console.log("= ruta_assignees ya existe, solo backfill por seguridad");
  } else {
    console.log("+ CREATE TABLE ruta_assignees");
    await client.execute(`CREATE TABLE ruta_assignees (
      ruta_id TEXT NOT NULL,
      operario_id TEXT NOT NULL,
      asignado_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      PRIMARY KEY (ruta_id, operario_id),
      FOREIGN KEY (ruta_id) REFERENCES rutas(id) ON DELETE CASCADE,
      FOREIGN KEY (operario_id) REFERENCES users(id)
    )`);
    console.log("+ CREATE INDEX idx_ruta_assignees_operario");
    await client.execute(
      "CREATE INDEX idx_ruta_assignees_operario ON ruta_assignees(operario_id)",
    );
  }

  // Backfill: para cada ruta, asegurar que su operario_id está en ruta_assignees
  // (solo si el operario actualmente existe en users — evita FK failure cuando
  // hay rutas huérfanas de usuarios borrados)
  const result = await client.execute(`INSERT INTO ruta_assignees (ruta_id, operario_id)
    SELECT r.id, r.operario_id FROM rutas r
    INNER JOIN users u ON u.id = r.operario_id
    WHERE NOT EXISTS (
      SELECT 1 FROM ruta_assignees ra
      WHERE ra.ruta_id = r.id AND ra.operario_id = r.operario_id
    )`);
  console.log(`= backfilled ${result.rowsAffected} filas en ruta_assignees`);

  // Reportar rutas huérfanas (sin operario válido)
  const orphans = await client.execute(`SELECT r.id, r.nombre, r.operario_id FROM rutas r
    LEFT JOIN users u ON u.id = r.operario_id
    WHERE u.id IS NULL`);
  if (orphans.rows.length > 0) {
    console.log(`! ${orphans.rows.length} rutas huérfanas (operario inexistente):`);
    for (const row of orphans.rows.slice(0, 10)) {
      console.log(`  - ${row.id} "${row.nombre}" → operario_id=${row.operario_id}`);
    }
  }

  console.log("[OK] Migración 0007 aplicada");
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
