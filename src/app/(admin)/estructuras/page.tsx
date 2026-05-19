import { redirect } from "next/navigation";

import { getWebSessionUser } from "@/lib/auth/web-session";

import { EstructurasWorkbench } from "./workbench";

export default async function EstructurasPage() {
  const me = await getWebSessionUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/dashboard");

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-180px)] min-h-[640px]">
      <div>
        <h1 className="text-2xl font-bold">Estructuras</h1>
        <p className="text-muted-foreground text-sm">
          Tanques, bocatomas, desarenadores y otras infraestructuras del
          sistema. Filtra por capa y municipio, edita atributos o reubica
          arrastrando el marcador.
        </p>
      </div>
      <EstructurasWorkbench />
    </div>
  );
}
