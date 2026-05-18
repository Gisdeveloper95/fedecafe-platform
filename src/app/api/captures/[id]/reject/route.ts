import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db/client";
import { logAudit } from "@/lib/audit";
import { json, jsonError, parseJson } from "@/lib/api/json";
import { requireAdmin } from "@/lib/auth/principal";

const RejectRequest = z.object({
  reason: z.string().min(1).max(1000),
  needsInfo: z.boolean().optional().default(false),
});

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  let admin;
  try {
    admin = await requireAdmin(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const { id } = await ctx.params;

  let body: z.infer<typeof RejectRequest>;
  try {
    body = await parseJson(request, RejectRequest);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const rows = await db
    .select()
    .from(schema.pendingCaptures)
    .where(eq(schema.pendingCaptures.id, id))
    .limit(1);
  const capture = rows[0];
  if (!capture) return jsonError("not_found", 404);
  if (capture.state !== "pending" && capture.state !== "needs_info") {
    return jsonError(`capture_in_state_${capture.state}`, 409);
  }

  const now = new Date().toISOString();
  const newState = body.needsInfo ? "needs_info" : "rejected";
  await db
    .update(schema.pendingCaptures)
    .set({
      state: newState,
      reviewedBy: admin.userId,
      reviewedAt: now,
      reviewNotes: body.reason,
    })
    .where(eq(schema.pendingCaptures.id, id));

  await logAudit({
    userId: admin.userId,
    action: `capture.${newState}`,
    targetId: id,
    details: { reason: body.reason },
  });

  return json({ id, state: newState });
}
