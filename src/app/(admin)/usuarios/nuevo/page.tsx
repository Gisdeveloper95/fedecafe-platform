import { redirect } from "next/navigation";

import { getWebSessionUser } from "@/lib/auth/web-session";

import { NewUserForm } from "./new-user-form";

export default async function NuevoUsuarioPage() {
  const me = await getWebSessionUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/dashboard");

  return (
    <div className="max-w-xl flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Crear usuario</h1>
        <p className="text-muted-foreground text-sm">
          El usuario podra iniciar sesion en la web (si es admin) o en la app
          movil (si es operario).
        </p>
      </div>
      <div className="bg-card border border-border rounded-lg p-6">
        <NewUserForm />
      </div>
    </div>
  );
}
