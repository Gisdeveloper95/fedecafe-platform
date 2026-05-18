import { eq } from "drizzle-orm";

import { db, schema } from "@/db/client";

import { describeAccountBlock, getGlobalLockdown } from "./lockdown";
import { type MobileTokenPayload, verifyMobileToken } from "./mobile-jwt";

export type MobilePrincipal = {
  userId: string;
  username: string;
  role: "admin" | "operario";
  device: string;
  accountType: "regular" | "demo";
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

  const userRows = await db
    .select({
      status: schema.users.status,
      accountType: schema.users.accountType,
      accessExpiresAt: schema.users.accessExpiresAt,
      role: schema.users.role,
    })
    .from(schema.users)
    .where(eq(schema.users.id, payload.sub))
    .limit(1);

  const user = userRows[0];
  if (!user) {
    throw new Response(
      JSON.stringify({ error: "user_not_found" }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }

  const lockdown = await getGlobalLockdown();
  const block = describeAccountBlock({
    status: user.status,
    accountType: user.accountType,
    accessExpiresAt: user.accessExpiresAt,
    globalLockdown: lockdown.enabled,
    role: user.role,
    bypassLockdownForAdmin: true,
  });
  if (!block.allowed) {
    throw new Response(
      JSON.stringify({ error: block.reason }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }

  return {
    userId: payload.sub,
    username: payload.username,
    role: payload.role,
    device: payload.device,
    accountType: (user.accountType as "regular" | "demo") ?? "regular",
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
