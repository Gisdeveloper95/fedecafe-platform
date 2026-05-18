import { eq } from "drizzle-orm";

import { db, schema } from "@/db/client";
import { logAudit } from "@/lib/audit";
import { json, jsonError } from "@/lib/api/json";
import { requireAdmin } from "@/lib/auth/principal";

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  let admin;
  try {
    admin = await requireAdmin(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const { code } = await ctx.params;
  const rows = await db
    .select()
    .from(schema.demoTokens)
    .where(eq(schema.demoTokens.code, code))
    .limit(1);

  const token = rows[0];
  if (!token) return jsonError("not_found", 404);

  await db
    .update(schema.demoTokens)
    .set({ isRevoked: true })
    .where(eq(schema.demoTokens.code, code));

  // Suspender los usuarios demo asociados a este token
  await db
    .update(schema.users)
    .set({ status: "suspended", active: false })
    .where(eq(schema.users.demoTokenCode, code));

  await logAudit({
    userId: admin.userId,
    action: "demo_token.revoked",
    targetId: code,
  });

  return json({ ok: true });
}
