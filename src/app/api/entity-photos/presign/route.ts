import { randomUUID } from "node:crypto";

import { z } from "zod";

import { json, jsonError, parseJson } from "@/lib/api/json";
import { requireAdmin } from "@/lib/auth/principal";
import { isR2Configured, presignUpload } from "@/lib/storage/r2";

const PresignRequest = z.object({
  targetType: z.enum(["medidor", "estructura", "tuberia"]),
  targetId: z.string().min(1),
  contentType: z.string().default("image/jpeg"),
  ext: z.string().regex(/^[a-z0-9]{1,5}$/i).default("jpg"),
  sizeBytes: z.number().int().positive().max(20 * 1024 * 1024).optional(),
});

/**
 * Devuelve una URL firmada para que el admin suba directo a R2.
 * La clave (storageKey) es estable: photos/{type}/{id}/{uuid}.{ext}
 */
export async function POST(request: Request) {
  try {
    await requireAdmin(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
  if (!isR2Configured()) return jsonError("r2_not_configured", 503);

  let body: z.infer<typeof PresignRequest>;
  try {
    body = await parseJson(request, PresignRequest);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const photoId = randomUUID();
  const storageKey = `photos/${body.targetType}/${body.targetId}/${photoId}.${body.ext}`;
  const presigned = await presignUpload({
    storageKey,
    contentType: body.contentType,
    contentLength: body.sizeBytes,
    expiresInSec: 3600,
  });

  return json({
    photoId,
    storageKey,
    uploadUrl: presigned.uploadUrl,
    expiresInSec: presigned.expiresInSec,
  });
}
