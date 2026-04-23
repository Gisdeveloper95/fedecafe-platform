import { eq } from "drizzle-orm";

import { db, schema } from "@/db/client";

import { verifyMobileToken } from "./mobile-jwt";
import { getWebSessionUser } from "./web-session";

export type Principal = {
  userId: string;
  username: string;
  fullName: string;
  role: "admin" | "operario";
  source: "web" | "mobile";
};

export async function getPrincipal(
  request: Request,
): Promise<Principal | null> {
  const authHeader = request.headers.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    try {
      const payload = await verifyMobileToken(token);
      if (payload.type !== "access") return null;
      const rows = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, payload.sub))
        .limit(1);
      const user = rows[0];
      if (!user || !user.active) return null;
      return {
        userId: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role as "admin" | "operario",
        source: "mobile",
      };
    } catch {
      return null;
    }
  }

  const web = await getWebSessionUser();
  if (!web) return null;
  return {
    userId: web.id,
    username: web.username,
    fullName: web.fullName,
    role: web.role,
    source: "web",
  };
}

export async function requirePrincipal(request: Request): Promise<Principal> {
  const p = await getPrincipal(request);
  if (!p) {
    throw new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return p;
}

export async function requireAdmin(request: Request): Promise<Principal> {
  const p = await requirePrincipal(request);
  if (p.role !== "admin") {
    throw new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
  return p;
}
