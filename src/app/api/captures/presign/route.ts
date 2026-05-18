import { z } from "zod";

import { json, jsonError, parseJson } from "@/lib/api/json";
import { requireMobileAccess } from "@/lib/auth/mobile-guard";
import {
  buildCapturePhotoKey,
  isR2Configured,
  presignUpload,
} from "@/lib/storage/r2";
import { env } from "@/lib/env";

const PresignRequest = z.object({
  captureId: z.string().uuid(),
  files: z
    .array(
      z.object({
        index: z.number().int().min(0).max(20),
        contentType: z.string().default("image/jpeg"),
        ext: z
          .string()
          .regex(/^[a-z0-9]{1,5}$/i)
          .default("jpg"),
        sizeBytes: z.number().int().positive().max(15 * 1024 * 1024).optional(),
      }),
    )
    .min(1)
    .max(10),
});

export async function POST(request: Request) {
  let principal;
  try {
    principal = await requireMobileAccess(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  if (!isR2Configured()) {
    return jsonError("r2_not_configured", 503);
  }

  let body: z.infer<typeof PresignRequest>;
  try {
    body = await parseJson(request, PresignRequest);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const uploads = await Promise.all(
    body.files.map(async (f) => {
      const key = buildCapturePhotoKey({
        captureId: body.captureId,
        index: f.index,
        ext: f.ext,
      });
      const presigned = await presignUpload({
        storageKey: key,
        contentType: f.contentType,
        contentLength: f.sizeBytes,
        expiresInSec: env.CAPTURES_PRESIGN_TTL_SEC,
      });
      return {
        index: f.index,
        storageKey: key,
        uploadUrl: presigned.uploadUrl,
        expiresInSec: presigned.expiresInSec,
      };
    }),
  );

  return json({
    captureId: body.captureId,
    operarioId: principal.userId,
    uploads,
  });
}
