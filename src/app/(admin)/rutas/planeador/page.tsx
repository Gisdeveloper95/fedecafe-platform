import { and, asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db, schema } from "@/db/client";
import { getWebSessionUser } from "@/lib/auth/web-session";

import { RoutePlanner } from "./planner";

export default async function PlaneadorPage() {
  const me = await getWebSessionUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/dashboard");

  const operarios = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      fullName: schema.users.fullName,
    })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.role, "operario"),
        eq(schema.users.status, "active"),
      ),
    )
    .orderBy(asc(schema.users.fullName));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Planeador de rutas</h1>
        <p className="text-muted-foreground text-sm">
          Diseña la ruta del operario haciendo click en el mapa o pegando
          códigos. Reordena los puntos arrastrando, o usa "Optimizar" para
          calcular la ruta más corta (heurística de vecino más cercano).
        </p>
      </div>
      <RoutePlanner operarios={operarios} />
    </div>
  );
}
