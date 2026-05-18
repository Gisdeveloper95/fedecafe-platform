import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { json, parseJson } from "@/lib/api/json";
import { requireAdmin } from "@/lib/auth/principal";
import { getGlobalLockdown, setGlobalLockdown } from "@/lib/auth/lockdown";

const SetLockdownRequest = z.object({
  enabled: z.boolean(),
});

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
  const state = await getGlobalLockdown();
  return json(state);
}

export async function POST(request: Request) {
  let admin;
  try {
    admin = await requireAdmin(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  let body: z.infer<typeof SetLockdownRequest>;
  try {
    body = await parseJson(request, SetLockdownRequest);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const state = await setGlobalLockdown(body.enabled, admin.userId);

  // No revocamos sesiones: el mobile-guard bloquea peticiones en tiempo real
  // mientras lockdown esté activo. Los admins pasan por bypassLockdownForAdmin.

  await logAudit({
    userId: admin.userId,
    action: body.enabled ? "lockdown.enabled" : "lockdown.disabled",
  });

  return json(state);
}
