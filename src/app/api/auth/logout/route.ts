import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db/client";
import { json, parseJson } from "@/lib/api/json";
import { hashToken } from "@/lib/auth/mobile-jwt";
import { destroyWebSession } from "@/lib/auth/web-session";

const LogoutRequest = z
  .object({
    refreshToken: z.string().min(1).optional(),
  })
  .optional();

export async function POST(request: Request) {
  // Si viene refreshToken en el body, es logout mobile
  let body;
  try {
    body = await parseJson(request, LogoutRequest);
  } catch {
    body = undefined;
  }

  if (body?.refreshToken) {
    const tokenHash = hashToken(body.refreshToken);
    await db
      .update(schema.sessions)
      .set({ revoked: true })
      .where(and(eq(schema.sessions.refreshTokenHash, tokenHash)));
  } else {
    await destroyWebSession();
  }

  return json({ ok: true });
}
