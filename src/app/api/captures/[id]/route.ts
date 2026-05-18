import { eq } from "drizzle-orm";

import { db, schema } from "@/db/client";
import { json, jsonError } from "@/lib/api/json";
import { requirePrincipal } from "@/lib/auth/principal";
import { isR2Configured, presignDownload } from "@/lib/storage/r2";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  let principal;
  try {
    principal = await requirePrincipal(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const { id } = await ctx.params;
  const rows = await db
    .select()
    .from(schema.pendingCaptures)
    .where(eq(schema.pendingCaptures.id, id))
    .limit(1);
  const capture = rows[0];
  if (!capture) return jsonError("not_found", 404);

  // Operario solo puede ver sus propias capturas
  if (
    principal.role === "operario" &&
    capture.operarioId !== principal.userId
  ) {
    return jsonError("forbidden", 403);
  }

  // Nombre del operario y de quien revisó
  const userIds = [capture.operarioId];
  if (capture.reviewedBy) userIds.push(capture.reviewedBy);
  const userRows = await db
    .select({
      id: schema.users.id,
      fullName: schema.users.fullName,
      username: schema.users.username,
    })
    .from(schema.users);
  const userMap = new Map(userRows.map((u) => [u.id, u]));

  // Presigned downloads para fotos (válido 1h)
  const attachments: string[] = safeParse<string[]>(capture.attachmentsJson) ?? [];
  const attachmentUrls = isR2Configured()
    ? await Promise.all(
        attachments.map(async (k) => {
          const presigned = await presignDownload({ storageKey: k });
          return {
            storageKey: k,
            downloadUrl: presigned.downloadUrl,
            expiresInSec: presigned.expiresInSec,
          };
        }),
      )
    : attachments.map((k) => ({
        storageKey: k,
        downloadUrl: null,
        expiresInSec: 0,
      }));

  return json({
    capture: {
      ...capture,
      payload: safeParse(capture.payloadJson),
      attachments: attachmentUrls,
      operario: userMap.get(capture.operarioId) ?? null,
      reviewer: capture.reviewedBy ? userMap.get(capture.reviewedBy) ?? null : null,
    },
  });
}

function safeParse<T = unknown>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}
