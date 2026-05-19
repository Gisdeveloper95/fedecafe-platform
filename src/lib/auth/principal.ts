import { eq } from "drizzle-orm";

import { db, schema } from "@/db/client";

import { describeAccountBlock, getGlobalLockdown } from "./lockdown";
import { verifyMobileToken } from "./mobile-jwt";
import { getWebSessionUser } from "./web-session";

export type Principal = {
  userId: string;
  username: string;
  fullName: string;
  /// "developer" es un rol oculto con bypass total. No aparece en /usuarios.
  role: "admin" | "operario" | "developer";
  accountType: "regular" | "demo";
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
      if (!user) return null;

      const lockdown = await getGlobalLockdown();
      const block = describeAccountBlock({
        status: user.status,
        accountType: user.accountType,
        accessExpiresAt: user.accessExpiresAt,
        globalLockdown: lockdown.enabled,
        role: user.role,
        bypassLockdownForAdmin: true,
      });
      if (!block.allowed) return null;

      return {
        userId: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role as Principal["role"],
        accountType: (user.accountType as "regular" | "demo") ?? "regular",
        source: "mobile",
      };
    } catch {
      return null;
    }
  }

  const web = await getWebSessionUser();
  if (!web) return null;

  const lockdown = await getGlobalLockdown();
  const block = describeAccountBlock({
    status: web.status,
    accountType: web.accountType,
    accessExpiresAt: web.accessExpiresAt,
    globalLockdown: lockdown.enabled,
    role: web.role,
    bypassLockdownForAdmin: true,
  });
  if (!block.allowed) return null;

  return {
    userId: web.id,
    username: web.username,
    fullName: web.fullName,
    role: web.role as Principal["role"],
    accountType: web.accountType,
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

/// Permite acceso a admin Y developer. El rol developer tiene todos los
/// privilegios de admin además de inmunidad total.
export async function requireAdmin(request: Request): Promise<Principal> {
  const p = await requirePrincipal(request);
  if (p.role !== "admin" && p.role !== "developer") {
    throw new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
  return p;
}

/// Solo developer. Para acciones de mantenimiento que ningún admin debería
/// poder ejecutar (ej: tocar otro developer, restaurar lockdown forzado).
export async function requireDeveloper(request: Request): Promise<Principal> {
  const p = await requirePrincipal(request);
  if (p.role !== "developer") {
    throw new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
  return p;
}
