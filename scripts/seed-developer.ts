/**
 * Crea (o actualiza) la cuenta developer oculta con inmunidad total.
 *
 * Uso:
 *   USERNAME=andres PASSWORD=... FULLNAME="Andrés Osorio" EMAIL=... \
 *     npx tsx scripts/seed-developer.ts
 *
 * Idempotente: si el usuario ya existe, solo ajusta role=developer y password
 * (si se proveyó). NO crea uno nuevo si el username ya está tomado por otro
 * rol — en ese caso lo escala a developer.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

try {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";

async function main() {
  const username = (process.env.USERNAME ?? "").toLowerCase().trim();
  const password = process.env.PASSWORD ?? "";
  const fullName = process.env.FULLNAME ?? username;
  const email = process.env.EMAIL ?? null;

  if (!username) {
    console.error("USERNAME es obligatorio");
    process.exit(2);
  }
  if (password.length > 0 && password.length < 8) {
    console.error("PASSWORD debe tener al menos 8 caracteres");
    process.exit(2);
  }

  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });

  const existing = await client.execute({
    sql: "SELECT id, username, role, status FROM users WHERE username = ?",
    args: [username],
  });

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    console.log(`Usuario "${username}" ya existe (id=${row.id}, role=${row.role})`);
    const updates: string[] = [];
    const args: (string | number | null)[] = [];
    if (row.role !== "developer") {
      updates.push("role = ?");
      args.push("developer");
    }
    updates.push("status = ?");
    args.push("active");
    updates.push("active = ?");
    args.push(1);
    updates.push("must_change_password = ?");
    args.push(0);
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      updates.push("password_hash = ?");
      args.push(hash);
    }
    if (fullName) {
      updates.push("full_name = ?");
      args.push(fullName);
    }
    if (email !== null) {
      updates.push("email = ?");
      args.push(email);
    }
    args.push(String(row.id));
    await client.execute({
      sql: `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
      args,
    });
    console.log(
      `✓ Usuario escalado a developer. Cambios: ${updates.join(", ")}`,
    );
  } else {
    if (!password) {
      console.error("Para crear un usuario nuevo, PASSWORD es obligatorio");
      process.exit(2);
    }
    const id = randomUUID();
    const hash = await bcrypt.hash(password, 10);
    await client.execute({
      sql: `INSERT INTO users
        (id, username, password_hash, full_name, email, role, status,
         account_type, must_change_password, active, created_by)
        VALUES (?, ?, ?, ?, ?, 'developer', 'active', 'regular', 0, 1, 'seed')`,
      args: [id, username, hash, fullName, email],
    });
    console.log(`✓ Developer creado: ${username} (id=${id})`);
  }

  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
