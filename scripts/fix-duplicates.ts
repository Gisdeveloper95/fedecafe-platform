import { readFileSync } from "node:fs";

try {
  const envContent = readFileSync(".env.local", "utf8");
  for (const line of envContent.split(/\r?\n/)) {
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

  const before = await client.execute("SELECT COUNT(*) as c FROM medidores");
  console.log("Antes:", before.rows[0].c);

  // Borrar solo las filas con sufijo .0 (las que enviaron como float-string).
  // El formato "limpio" (sin .0) se conserva.
  const del = await client.execute(
    "DELETE FROM medidores WHERE contrato LIKE '%.0'",
  );
  console.log("Filas eliminadas:", del.rowsAffected);

  const after = await client.execute("SELECT COUNT(*) as c FROM medidores");
  console.log("Despues:", after.rows[0].c);

  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
