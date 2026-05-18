import { randomInt } from "node:crypto";

import { eq } from "drizzle-orm";

import { db, schema } from "@/db/client";

export function generateDemoCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function createUniqueDemoCode(maxRetries = 8): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const code = generateDemoCode();
    const rows = await db
      .select({ code: schema.demoTokens.code })
      .from(schema.demoTokens)
      .where(eq(schema.demoTokens.code, code))
      .limit(1);
    if (rows.length === 0) return code;
  }
  throw new Error("no_se_pudo_generar_codigo_demo_unico");
}

export type DemoTokenValidation =
  | { ok: true; token: typeof schema.demoTokens.$inferSelect }
  | { ok: false; reason: string };

export async function validateDemoTokenForActivation(
  code: string,
): Promise<DemoTokenValidation> {
  const rows = await db
    .select()
    .from(schema.demoTokens)
    .where(eq(schema.demoTokens.code, code))
    .limit(1);

  const token = rows[0];
  if (!token) return { ok: false, reason: "token_not_found" };
  if (token.isRevoked) return { ok: false, reason: "token_revoked" };
  if (new Date(token.expiresAt).getTime() < Date.now()) {
    return { ok: false, reason: "token_expired" };
  }
  if (token.activationsUsed >= token.maxActivations) {
    return { ok: false, reason: "token_exhausted" };
  }
  return { ok: true, token };
}
