import { randomUUID } from "node:crypto";

import { db, schema } from "@/db/client";

export async function logAudit(args: {
  userId?: string | null;
  action: string;
  targetId?: string | null;
  details?: unknown;
}): Promise<void> {
  try {
    await db.insert(schema.auditLog).values({
      id: randomUUID(),
      userId: args.userId ?? null,
      action: args.action,
      targetId: args.targetId ?? null,
      details:
        args.details !== undefined ? JSON.stringify(args.details) : null,
    });
  } catch (err) {
    console.error("[audit] no se pudo registrar:", err);
  }
}
