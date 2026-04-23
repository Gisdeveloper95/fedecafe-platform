import { defineConfig } from "drizzle-kit";
import { config } from "node:process";

// Cargar variables de entorno desde .env.local para drizzle-kit CLI
import { readFileSync } from "node:fs";
import { join } from "node:path";

try {
  const envContent = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  for (const line of envContent.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
} catch {
  // .env.local ausente - usar variables del entorno
}

if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  throw new Error("Faltan TURSO_DATABASE_URL o TURSO_AUTH_TOKEN");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
  strict: true,
  verbose: true,
});
