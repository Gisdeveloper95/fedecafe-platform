import { redirect } from "next/navigation";

import { getWebSessionUser } from "@/lib/auth/web-session";
import { getGlobalLockdown } from "@/lib/auth/lockdown";

import { LockdownToggle } from "./lockdown-toggle";

export default async function ConfiguracionPage() {
  const me = await getWebSessionUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/dashboard");

  const lockdown = await getGlobalLockdown();

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Configuración del sistema</h1>
        <p className="text-muted-foreground text-sm">
          Controles de emergencia y ajustes globales.
        </p>
      </div>

      <section className="bg-card border border-border rounded-lg p-6 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-lg">Kill switch global</h2>
            <p className="text-sm text-muted-foreground">
              Al activarlo, todos los usuarios no-admin son bloqueados en la
              próxima llamada al servidor o renovación de sesión. Útil para
              suspender el servicio en caso de incidente o impago general.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Los admins (web) <strong>no</strong> son afectados, para que
              puedas reactivar el sistema.
            </p>
          </div>
          <LockdownToggle initialEnabled={lockdown.enabled} />
        </div>
        {lockdown.updatedAt && (
          <div className="text-xs text-muted-foreground">
            Última modificación:{" "}
            {new Date(lockdown.updatedAt).toLocaleString("es-CO")}
          </div>
        )}
      </section>

      <section className="bg-card border border-border rounded-lg p-6 flex flex-col gap-2">
        <h2 className="font-semibold text-lg">Cuenta personal</h2>
        <p className="text-sm text-muted-foreground">
          Cambia tu contraseña desde tu perfil.
        </p>
        <div>
          <a
            href="/change-password"
            className="inline-block bg-brand text-brand-foreground rounded px-3 py-2 text-sm hover:opacity-90"
          >
            Cambiar mi contraseña
          </a>
        </div>
      </section>
    </div>
  );
}
