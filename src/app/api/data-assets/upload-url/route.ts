import { z } from "zod";

import { json, jsonError, parseJson } from "@/lib/api/json";
import { requireAdmin } from "@/lib/auth/principal";
import {
  buildAssetKey,
  isR2Configured,
  presignUpload,
} from "@/lib/storage/r2";

const RequestSchema = z.object({
  key: z.string().min(1).max(120),
  layerType: z.string().min(1),
  scope: z.string().min(1),
  version: z.number().int().positive(),
  filename: z.string().min(1).max(120),
  contentType: z.string().optional(),
  sizeBytes: z.number().int().positive().max(5 * 1024 * 1024 * 1024).optional(),
});

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  if (!isR2Configured()) {
    return jsonError("r2_not_configured", 503);
  }

  let body: z.infer<typeof RequestSchema>;
  try {
    body = await parseJson(request, RequestSchema);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const storageKey = buildAssetKey({
    layerType: body.layerType,
    scope: body.scope,
    version: body.version,
    filename: body.filename,
  });
  const presigned = await presignUpload({
    storageKey,
    contentType: body.contentType,
    contentLength: body.sizeBytes,
    expiresInSec: 3600,
  });

  return json({
    storageKey,
    uploadUrl: presigned.uploadUrl,
    expiresInSec: presigned.expiresInSec,
    publishHint: {
      method: "POST /api/data-assets",
      body: {
        key: body.key,
        layerType: body.layerType,
        scope: body.scope,
        storageKey,
      },
    },
  });
}
