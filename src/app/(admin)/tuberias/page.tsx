import { redirect } from "next/navigation";

import { getWebSessionUser } from "@/lib/auth/web-session";

import { TuberiasWorkbench } from "./workbench";

export default async function TuberiasPage() {
  const me = await getWebSessionUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/dashboard");

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-180px)] min-h-[640px]">
      <div>
        <h1 className="text-2xl font-bold">Tuberías</h1>
        <p className="text-muted-foreground text-sm">
          Red de tuberías sincronizada desde rutas_builder. Filtra por
          material, diámetro y municipio. Las geometrías LineString se renderizan
          coloreadas por material.
        </p>
      </div>
      <TuberiasWorkbench />
    </div>
  );
}
