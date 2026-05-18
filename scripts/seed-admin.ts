import { readFileSync } from "node:fs";

try {
  const envContent = readFileSync(".env.local", "utf8");
  for (const line of envContent.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  // Ok
}

import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";

import * as schema from "../src/db/schema";

async function main() {
  const username = process.argv[2] ?? "admin";
  const password = process.argv[3] ?? "admin123";
  const fullName = process.argv[4] ?? "Administrador";

  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
  const db = drizzle(client, { schema, casing: "snake_case" });

  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.username, username))
    .limit(1);

  if (existing.length > 0) {
    console.log(`Usuario '${username}' ya existe. No se hizo nada.`);
    await client.close();
    return;
  }

  const hash = await bcrypt.hash(password, 10);
  const id = randomUUID();
  await db.insert(schema.users).values({
    id,
    username,
    passwordHash: hash,
    fullName,
    role: "admin",
    status: "active",
    accountType: "regular",
    mustChangePassword: false,
    active: true,
  });

  console.log(`Admin creado:`);
  console.log(`  id       : ${id}`);
  console.log(`  username : ${username}`);
  console.log(`  password : ${password}`);
  console.log("Cambia la contraseña al primer login.");

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
