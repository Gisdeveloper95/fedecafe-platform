import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db/client";
import { logAudit } from "@/lib/audit";
import { json, jsonError, parseJson } from "@/lib/api/json";
import { requireAdmin, requirePrincipal } from "@/lib/auth/principal";
import {
  headObject,
  isR2Configured,
  presignDownload,
} from "@/lib/storage/r2";

const ConfirmRequest = z.object({
  photoId: z.string().uuid(),
  targetType: z.enum(["medidor", "estructura", "tuberia"]),
  targetId: z.string().min(1),
  storageKey: z.string().min(1),
  contentType: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  caption: z.string().max(500).optional(),
});

export async function GET(request: Request) {
  try {
    await requirePrincipal(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const url = new URL(request.url);
  const targetType = url.searchParams.get("targetType");
  const targetId = url.searchParams.get("targetId");
  if (
    !targetType ||
    !targetId ||
    (targetType !== "medidor" &&
      targetType !== "estructura" &&
      targetType !== "tuberia")
  ) {
    return jsonError("targetType_and_targetId_required", 400);
  }

  const rows = await db
    .select()
    .from(schema.entityPhotos)
    .where(
      and(
        eq(schema.entityPhotos.targetType, targetType),
        eq(schema.entityPhotos.targetId, targetId),
      ),
    )
    .orderBy(desc(schema.entityPhotos.uploadedAt));

  // Generar presigned URLs para mostrar inline
  const r2Ready = isR2Configured();
  const photos = await Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      caption: r.caption,
      contentType: r.contentType,
      sizeBytes: r.sizeBytes,
      uploadedAt: r.uploadedAt,
      uploadedBy: r.uploadedBy,
      url: r2Ready
        ? (await presignDownload({ storageKey: r.storageKey, expiresInSec: 3600 }))
            .downloadUrl
        : null,
    })),
  );

  return json({ photos });
}

export async function POST(request: Request) {
  let admin;
  try {
    admin = await requireAdmin(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
  if (!isR2Configured()) return jsonError("r2_not_configured", 503);

  let body: z.infer<typeof ConfirmRequest>;
  try {
    body = await parseJson(request, ConfirmRequest);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  // Verificar que la foto existe en R2
  const head = await headObject(body.storageKey);
  if (!head.exists) {
    return jsonError("photo_not_uploaded_to_r2", 409);
  }

  await db.insert(schema.entityPhotos).values({
    id: body.photoId,
    targetType: body.targetType,
    targetId: body.targetId,
    storageKey: body.storageKey,
    contentType: body.contentType ?? head.contentType ?? null,
    sizeBytes: body.sizeBytes ?? head.sizeBytes ?? null,
    caption: body.caption ?? null,
    uploadedBy: admin.userId,
  });

  await logAudit({
    userId: admin.userId,
    action: "entity_photo.uploaded",
    targetId: body.photoId,
    details: { targetType: body.targetType, targetId: body.targetId },
  });

  return json({ id: body.photoId, ok: true }, { status: 201 });
}
