import { eq } from "drizzle-orm";

import { db, schema } from "@/db/client";
import { logAudit } from "@/lib/audit";
import { json, jsonError } from "@/lib/api/json";
import { requireAdmin } from "@/lib/auth/principal";
import { deleteObject, isR2Configured } from "@/lib/storage/r2";

export async function DELETE(
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

  const rows = await db
    .select()
    .from(schema.entityPhotos)
    .where(eq(schema.entityPhotos.id, id))
    .limit(1);
  const photo = rows[0];
  if (!photo) return jsonError("not_found", 404);

  // Borrar de R2 primero (best-effort)
  if (isR2Configured()) {
    try {
      await deleteObject(photo.storageKey);
    } catch (e) {
      console.warn(`[entity-photos] no se pudo borrar blob R2: ${e}`);
    }
  }
  await db.delete(schema.entityPhotos).where(eq(schema.entityPhotos.id, id));

  await logAudit({
    userId: admin.userId,
    action: "entity_photo.deleted",
    targetId: id,
    details: { targetType: photo.targetType, targetId: photo.targetId },
  });

  return json({ ok: true });
}
