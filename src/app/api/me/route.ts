import { json, jsonError } from "@/lib/api/json";
import { getWebSessionUser } from "@/lib/auth/web-session";
import { requireMobileAccess } from "@/lib/auth/mobile-guard";

export async function GET(request: Request) {
  // Preferir Bearer token si viene; si no, sesión web.
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const principal = await requireMobileAccess(request);
      return json({ user: principal, source: "mobile" });
    } catch (err) {
      if (err instanceof Response) return err;
      throw err;
    }
  }

  const user = await getWebSessionUser();
  if (!user) return jsonError("unauthenticated", 401);

  return json({ user, source: "web" });
}
