import { readFileSync } from "node:fs";

try {
  const envContent = readFileSync(".env.local", "utf8");
  for (const line of envContent.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  // Ok si no hay .env.local
}

import { createClient } from "@libsql/client";

async function main() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });

  const result = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
  );
  console.log("Tablas en Turso:");
  for (const row of result.rows) console.log(" -", row.name);

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
