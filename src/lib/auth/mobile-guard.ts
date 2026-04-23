import { eq } from "drizzle-orm";

import { db, schema } from "@/db/client";

import { type MobileTokenPayload, verifyMobileToken } from "./mobile-jwt";

export type MobilePrincipal = {
  userId: string;
  username: string;
  role: "admin" | "operario";
  device: string;
};

export async function requireMobileAccess(
  request: Request,
): Promise<MobilePrincipal> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Response(
      JSON.stringify({ error: "missing_bearer_token" }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }
  const token = authHeader.slice("Bearer ".length).trim();

  let payload: MobileTokenPayload;
  try {
    payload = await verifyMobileToken(token);
  } catch {
    throw new Response(
      JSON.stringify({ error: "invalid_token" }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }
  if (payload.type !== "access") {
    throw new Response(
      JSON.stringify({ error: "not_access_token" }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }

  // Opcional: verificar que el user siga activo en la DB
  const userRows = await db
    .select({ active: schema.users.active })
    .from(schema.users)
    .where(eq(schema.users.id, payload.sub))
    .limit(1);

  const user = userRows[0];
  if (!user || !user.active) {
    throw new Response(
      JSON.stringify({ error: "user_inactive" }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }

  return {
    userId: payload.sub,
    username: payload.username,
    role: payload.role,
    device: payload.device,
  };
}

export function requireMobileRole(
  principal: MobilePrincipal,
  role: "admin" | "operario",
): void {
  if (principal.role !== role) {
    throw new Response(
      JSON.stringify({ error: "forbidden" }),
      { status: 403, headers: { "content-type": "application/json" } },
    );
  }
}
