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

  const total = await client.execute("SELECT COUNT(*) as c FROM medidores");
  console.log("Total filas medidores:", total.rows[0].c);

  // Muestra los primeros 20 contratos
  const first = await client.execute(
    "SELECT contrato, latitude, longitude, nombre, length(contrato) as len FROM medidores ORDER BY contrato LIMIT 20",
  );
  console.log("\nPrimeros 20 contratos:");
  for (const r of first.rows) {
    console.log(` contrato='${r.contrato}' len=${r.len} lat=${r.latitude} nombre=${r.nombre}`);
  }

  // Ver cuántos son puramente numéricos vs no
  const numericos = await client.execute(
    "SELECT COUNT(*) as c FROM medidores WHERE CAST(contrato AS INTEGER) > 0 AND contrato = CAST(CAST(contrato AS INTEGER) AS TEXT)",
  );
  const concomma = await client.execute(
    "SELECT COUNT(*) as c FROM medidores WHERE contrato LIKE '%.0%'",
  );
  const conespacios = await client.execute(
    "SELECT COUNT(*) as c FROM medidores WHERE contrato != trim(contrato)",
  );
  console.log("\nFormato:");
  console.log("  Puramente enteros string:", numericos.rows[0].c);
  console.log("  Con '.0' al final:", concomma.rows[0].c);
  console.log("  Con espacios/saltos:", conespacios.rows[0].c);

  // Buscar contratos que parezcan la "misma entidad" en ambas variantes (8885 vs 8885.0)
  const variantes = await client.execute(`
    SELECT contrato FROM medidores WHERE contrato LIKE '8885%' LIMIT 10
  `);
  console.log("\nVariantes de 8885:");
  for (const r of variantes.rows) console.log(" -", r.contrato);

  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
