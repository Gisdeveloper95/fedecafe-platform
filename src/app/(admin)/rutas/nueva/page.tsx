import { and, asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db, schema } from "@/db/client";
import { getWebSessionUser } from "@/lib/auth/web-session";

import { NewRutaForm } from "./new-ruta-form";

export default async function NuevaRutaPage() {
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
    <div className="max-w-3xl flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Crear ruta</h1>
        <p className="text-muted-foreground text-sm">
          Selecciona un operario, tipo de ruta y pega los codigos (contrato o
          codigo) que la componen.
        </p>
      </div>
      <div className="bg-card border border-border rounded-lg p-6">
        {operarios.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            No hay operarios activos. Crea uno primero en{" "}
            <a href="/usuarios/nuevo" className="text-brand underline">
              Usuarios
            </a>
            .
          </div>
        ) : (
          <NewRutaForm operarios={operarios} />
        )}
      </div>
    </div>
  );
}
