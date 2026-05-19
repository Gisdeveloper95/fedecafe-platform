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
  const sql = readFileSync("./drizzle/0004_absent_eternals.sql", "utf8");
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });

  for (const stmt of statements) {
    console.log("→", stmt.split("\n")[0].slice(0, 80));
    await client.execute(stmt);
  }
  console.log("[OK] Migración 0004 aplicada");
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
