import Link from "next/link";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db, schema } from "@/db/client";
import { getWebSessionUser } from "@/lib/auth/web-session";

const ESTADO_COLOR: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-800 border-amber-200",
  en_curso: "bg-blue-100 text-blue-800 border-blue-200",
  completada: "bg-green-100 text-green-800 border-green-200",
  archivada: "bg-gray-100 text-gray-600 border-gray-200",
};

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function getMonthDates(year: number, month: number) {
  // month 0-indexed
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startOffset = first.getDay(); // 0=domingo
  const days: { dateStr: string; day: number; inMonth: boolean }[] = [];
  // padding inicial
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({
      dateStr: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      day: d.getDate(),
      inMonth: false,
    });
  }
  for (let d = 1; d <= last.getDate(); d++) {
    days.push({
      dateStr: `${year}-${pad(month + 1)}-${pad(d)}`,
      day: d,
      inMonth: true,
    });
  }
  // padding final hasta múltiplo de 7
  while (days.length % 7 !== 0) {
    const lastDay = days[days.length - 1];
    const [y, m, d] = lastDay.dateStr.split("-").map(Number);
    const next = new Date(y, m - 1, d + 1);
    days.push({
      dateStr: `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`,
      day: next.getDate(),
      inMonth: false,
    });
  }
  return days;
}

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; operario?: string }>;
}) {
  const me = await getWebSessionUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/dashboard");

  const sp = await searchParams;
  const now = new Date();
  const year = parseInt(sp.year ?? `${now.getFullYear()}`, 10);
  const month = parseInt(sp.month ?? `${now.getMonth() + 1}`, 10) - 1;
  const operarioFilter = sp.operario;

  // Rango YYYY-MM-01 → YYYY-MM-last
  const start = `${year}-${pad(month + 1)}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const end = `${year}-${pad(month + 1)}-${pad(lastDay)}`;

  const where = [
    gte(schema.rutas.fechaObjetivo, start),
    lte(schema.rutas.fechaObjetivo, end),
  ];
  if (operarioFilter) {
    where.push(eq(schema.rutas.operarioId, operarioFilter));
  }

  const rutas = await db
    .select({
      id: schema.rutas.id,
      nombre: schema.rutas.nombre,
      tipo: schema.rutas.tipo,
      estado: schema.rutas.estado,
      fechaObjetivo: schema.rutas.fechaObjetivo,
      operarioId: schema.rutas.operarioId,
      operarioName: schema.users.fullName,
    })
    .from(schema.rutas)
    .leftJoin(schema.users, eq(schema.users.id, schema.rutas.operarioId))
    .where(and(...where))
    .orderBy(asc(schema.rutas.fechaObjetivo));

  // Agrupar por fecha
  const byDate = new Map<string, typeof rutas>();
  for (const r of rutas) {
    if (!r.fechaObjetivo) continue;
    const k = r.fechaObjetivo.slice(0, 10);
    if (!byDate.has(k)) byDate.set(k, []);
    byDate.get(k)!.push(r);
  }

  // Operarios para filtro
  const operarios = await db
    .select({
      id: schema.users.id,
      fullName: schema.users.fullName,
    })
    .from(schema.users)
    .where(eq(schema.users.role, "operario"))
    .limit(200);

  const days = getMonthDates(year, month);
  const monthNames = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];

  const prev = new Date(year, month - 1, 1);
  const next = new Date(year, month + 1, 1);
  const operQuery = operarioFilter ? `&operario=${operarioFilter}` : "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            Calendario de rutas — {monthNames[month]} {year}
          </h1>
          <p className="text-muted-foreground text-sm">
            {rutas.length} rutas con fecha objetivo en este mes
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/rutas/calendario?year=${prev.getFullYear()}&month=${prev.getMonth() + 1}${operQuery}`}
            className="border border-border rounded px-3 py-1.5 text-sm hover:bg-muted"
          >
            ← Anterior
          </Link>
          <Link
            href={`/rutas/calendario?year=${now.getFullYear()}&month=${now.getMonth() + 1}${operQuery}`}
            className="border border-border rounded px-3 py-1.5 text-sm hover:bg-muted"
          >
            Hoy
          </Link>
          <Link
            href={`/rutas/calendario?year=${next.getFullYear()}&month=${next.getMonth() + 1}${operQuery}`}
            className="border border-border rounded px-3 py-1.5 text-sm hover:bg-muted"
          >
            Siguiente →
          </Link>
        </div>
      </div>

      <form className="flex gap-2 text-sm" method="get">
        <input type="hidden" name="year" value={year} />
        <input type="hidden" name="month" value={month + 1} />
        <select
          name="operario"
          defaultValue={operarioFilter ?? ""}
          className="border border-border rounded px-3 py-1.5 bg-card"
        >
          <option value="">Todos los operarios</option>
          {operarios.map((o) => (
            <option key={o.id} value={o.id}>
              {o.fullName}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="border border-border rounded px-3 py-1.5 hover:bg-muted"
        >
          Filtrar
        </button>
      </form>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="grid grid-cols-7 bg-muted text-xs font-medium text-muted-foreground">
          {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((d) => (
            <div key={d} className="px-3 py-2 text-center">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const dayRutas = byDate.get(d.dateStr) ?? [];
            const isToday = d.dateStr === `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
            return (
              <div
                key={i}
                className={`border-t border-l border-border min-h-[120px] p-2 ${
                  !d.inMonth ? "bg-muted/30" : ""
                } ${isToday ? "bg-amber-50" : ""}`}
              >
                <div
                  className={`text-xs ${
                    d.inMonth ? "font-medium" : "text-muted-foreground"
                  } ${isToday ? "text-amber-700" : ""}`}
                >
                  {d.day}
                </div>
                <div className="flex flex-col gap-1 mt-1">
                  {dayRutas.map((r) => (
                    <Link
                      key={r.id}
                      href={`/rutas/${r.id}`}
                      className={`text-[10px] leading-tight border rounded px-1 py-0.5 hover:opacity-80 ${ESTADO_COLOR[r.estado] ?? "bg-muted"}`}
                      title={`${r.nombre}\nOperario: ${r.operarioName ?? "-"}\nTipo: ${r.tipo}\nEstado: ${r.estado}`}
                    >
                      <div className="font-medium truncate">{r.nombre}</div>
                      <div className="opacity-75 truncate">
                        {r.operarioName}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
