import { eq } from "drizzle-orm";

import { db, schema } from "@/db/client";
import { json, jsonError } from "@/lib/api/json";
import { requirePrincipal } from "@/lib/auth/principal";
import { isR2Configured, presignDownload } from "@/lib/storage/r2";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ key: string }> },
) {
  try {
    await requirePrincipal(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  if (!isR2Configured()) {
    return jsonError("r2_not_configured", 503);
  }

  const { key } = await ctx.params;
  const url = new URL(request.url);
  const version = url.searchParams.get("version");

  let query = db.select().from(schema.dataAssets).where(eq(schema.dataAssets.key, key));
  const rows = await query;
  if (rows.length === 0) return jsonError("not_found", 404);

  const target = version
    ? rows.find((r) => r.version === parseInt(version, 10))
    : rows.reduce((a, b) => (a.version > b.version ? a : b));
  if (!target) return jsonError("version_not_found", 404);

  const presigned = await presignDownload({
    storageKey: target.storageKey,
    expiresInSec: 3600,
  });

  return json({
    key: target.key,
    version: target.version,
    sizeBytes: target.sizeBytes,
    sha256: target.sha256,
    downloadUrl: presigned.downloadUrl,
    expiresInSec: presigned.expiresInSec,
  });
}
