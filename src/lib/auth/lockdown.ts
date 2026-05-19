import { eq } from "drizzle-orm";

import { db, schema } from "@/db/client";

export const GLOBAL_LOCKDOWN_KEY = "global_lockdown";

export type LockdownState = {
  enabled: boolean;
  updatedAt?: string;
  updatedBy?: string;
};

export async function getGlobalLockdown(): Promise<LockdownState> {
  const rows = await db
    .select()
    .from(schema.globalSettings)
    .where(eq(schema.globalSettings.key, GLOBAL_LOCKDOWN_KEY))
    .limit(1);

  const row = rows[0];
  if (!row) return { enabled: false };
  return {
    enabled: row.value === "true",
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy ?? undefined,
  };
}

export async function setGlobalLockdown(
  enabled: boolean,
  updatedBy?: string,
): Promise<LockdownState> {
  const now = new Date().toISOString();
  const value = enabled ? "true" : "false";

  await db
    .insert(schema.globalSettings)
    .values({
      key: GLOBAL_LOCKDOWN_KEY,
      value,
      updatedAt: now,
      updatedBy,
    })
    .onConflictDoUpdate({
      target: schema.globalSettings.key,
      set: { value, updatedAt: now, updatedBy },
    });

  return { enabled, updatedAt: now, updatedBy };
}

// Determina si una cuenta de usuario puede operar en este momento.
// No bloquea por estado del JWT (eso es responsabilidad del verify), solo por estado de cuenta y lockdown.
//
// El rol "developer" tiene inmunidad TOTAL: ignora suspensión, expiración,
// lockdown global, etc. Es una red de seguridad de último recurso si los
// admins se bloquean entre sí o si el lockdown deja a todos afuera.
export function describeAccountBlock(args: {
  status: "active" | "suspended" | "deleted" | string;
  accountType?: "regular" | "demo" | string;
  accessExpiresAt?: string | null;
  globalLockdown?: boolean;
  bypassLockdownForAdmin?: boolean;
  role?: "admin" | "operario" | "developer" | string;
}): { allowed: true } | { allowed: false; reason: string } {
  // Inmunidad total para developer — única excepción es "deleted" (que igual no
  // debería poder pasarle a este rol por la protección en endpoints).
  if (args.role === "developer" && args.status !== "deleted") {
    return { allowed: true };
  }
  if (args.status === "deleted") {
    return { allowed: false, reason: "user_deleted" };
  }
  if (args.status === "suspended") {
    return { allowed: false, reason: "user_suspended" };
  }
  if (args.status !== "active") {
    return { allowed: false, reason: "user_inactive" };
  }
  if (args.accessExpiresAt) {
    const expMs = new Date(args.accessExpiresAt).getTime();
    if (!Number.isNaN(expMs) && expMs < Date.now()) {
      return {
        allowed: false,
        reason:
          args.accountType === "demo" ? "demo_token_expired" : "access_expired",
      };
    }
  }
  if (args.globalLockdown) {
    if (args.bypassLockdownForAdmin && args.role === "admin") {
      return { allowed: true };
    }
    return { allowed: false, reason: "global_lockdown" };
  }
  return { allowed: true };
}
