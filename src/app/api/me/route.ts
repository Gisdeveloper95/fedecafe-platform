import { eq } from "drizzle-orm";

import { db, schema } from "@/db/client";
import { json, jsonError } from "@/lib/api/json";
import { getWebSessionUser } from "@/lib/auth/web-session";
import { requireMobileAccess } from "@/lib/auth/mobile-guard";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    let principal;
    try {
      principal = await requireMobileAccess(request);
    } catch (err) {
      if (err instanceof Response) return err;
      throw err;
    }

    const rows = await db
      .select({
        id: schema.users.id,
        username: schema.users.username,
        fullName: schema.users.fullName,
        email: schema.users.email,
        role: schema.users.role,
        status: schema.users.status,
        accountType: schema.users.accountType,
        mustChangePassword: schema.users.mustChangePassword,
        accessExpiresAt: schema.users.accessExpiresAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, principal.userId))
      .limit(1);

    const user = rows[0];
    if (!user) return jsonError("not_found", 404);

    return json({
      user: { ...user, device: principal.device },
      source: "mobile",
    });
  }

  const user = await getWebSessionUser();
  if (!user) return jsonError("unauthenticated", 401);

  return json({ user, source: "web" });
}
