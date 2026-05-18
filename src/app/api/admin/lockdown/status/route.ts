import { json } from "@/lib/api/json";
import { getGlobalLockdown } from "@/lib/auth/lockdown";

// Endpoint público mínimo para que el cliente sepa si el sistema está en lockdown
// (sin requerir autenticación). Solo expone el flag, no quién/cuándo.
export async function GET() {
  const state = await getGlobalLockdown();
  return json({ enabled: state.enabled });
}
