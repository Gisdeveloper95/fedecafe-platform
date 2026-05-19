import Link from "next/link";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db, schema } from "@/db/client";
import { getWebSessionUser } from "@/lib/auth/web-session";
import { isR2Configured, presignDownload } from "@/lib/storage/r2";

import { ReviewActions } from "./review-actions";

const OP_LABEL: Record<string, string> = {
  capture_visit: "Visita a punto existente",
  create_medidor: "Nuevo medidor",
  update_medidor: "Actualización de medidor",
  create_estructura: "Nueva estructura",
  update_estructura: "Actualización de estructura",
  mark_removed: "Marcar como retirado",
  report_anomaly: "Reporte de anomalía",
};

function safeParse<T = unknown>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export default async function CaptureDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getWebSessionUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/dashboard");

  const { id } = await params;
  const rows = await db
    .select()
    .from(schema.pendingCaptures)
    .where(eq(schema.pendingCaptures.id, id))
    .limit(1);
  const capture = rows[0];
  if (!capture) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Captura no encontrada.</p>
        <Link
          href="/revision"
          className="text-brand underline mt-3 inline-block"
        >
          Volver a la lista
        </Link>
      </div>
    );
  }

  const payload = safeParse<Record<string, unknown>>(capture.payloadJson) ?? {};
  const attachments = safeParse<string[]>(capture.attachmentsJson) ?? [];

  const photoUrls = isR2Configured()
    ? await Promise.all(
        attachments.map(async (k) => ({
          storageKey: k,
          url: (await presignDownload({ storageKey: k })).downloadUrl,
        })),
      )
    : attachments.map((k) => ({ storageKey: k, url: null }));

  // Datos del operario
  let operario: { fullName: string; username: string } | null = null;
  if (capture.operarioId) {
    const r = await db
      .select({
        fullName: schema.users.fullName,
        username: schema.users.username,
      })
      .from(schema.users)
      .where(eq(schema.users.id, capture.operarioId))
      .limit(1);
    operario = r[0] ?? null;
  }

  // Si es update, traer estado actual del objeto
  let currentTargetData: Record<string, unknown> | null = null;
  if (capture.targetId) {
    if (capture.targetType === "medidor") {
      const r = await db
        .select()
        .from(schema.medidores)
        .where(eq(schema.medidores.contrato, capture.targetId))
        .limit(1);
      currentTargetData = r[0] as Record<string, unknown> | null;
    } else if (capture.targetType === "estructura") {
      const r = await db
        .select()
        .from(schema.estructuras)
        .where(eq(schema.estructuras.codigo, capture.targetId))
        .limit(1);
      currentTargetData = r[0] as Record<string, unknown> | null;
    }
  }

  const canAct =
    capture.state === "pending" || capture.state === "needs_info";

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div>
        <Link
          href="/revision"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Volver a la lista
        </Link>
        <h1 className="text-2xl font-bold mt-2">
          {OP_LABEL[capture.opType] ?? capture.opType}
        </h1>
        <p className="text-muted-foreground text-sm">ID {capture.id}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Columna izquierda: contexto */}
        <div className="bg-card border border-border rounded-lg p-5 flex flex-col gap-4">
          <h2 className="font-semibold">Contexto</h2>
          <dl className="grid grid-cols-3 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Operario</dt>
            <dd className="col-span-2">
              {operario
                ? `${operario.fullName} (@${operario.username})`
                : capture.operarioId}
            </dd>

            <dt className="text-muted-foreground">Tipo objetivo</dt>
            <dd className="col-span-2">{capture.targetType}</dd>

            {capture.targetId && (
              <>
                <dt className="text-muted-foreground">Objetivo</dt>
                <dd className="col-span-2 font-mono">{capture.targetId}</dd>
              </>
            )}

            <dt className="text-muted-foreground">Capturado</dt>
            <dd className="col-span-2">
              {new Date(capture.capturedAt).toLocaleString("es-CO")}
            </dd>

            <dt className="text-muted-foreground">Subido</dt>
            <dd className="col-span-2">
              {new Date(capture.uploadedAt).toLocaleString("es-CO")}
            </dd>

            {capture.gpsLat !== null && capture.gpsLon !== null && (
              <>
                <dt className="text-muted-foreground">GPS captura</dt>
                <dd className="col-span-2">
                  {capture.gpsLat?.toFixed(6)}, {capture.gpsLon?.toFixed(6)}
                  {capture.gpsAccuracy ? (
                    <span className="text-xs text-muted-foreground ml-1">
                      (±{Math.round(capture.gpsAccuracy)}m)
                    </span>
                  ) : null}
                </dd>
              </>
            )}

            <dt className="text-muted-foreground">Estado</dt>
            <dd className="col-span-2">
              {capture.state === "pending" && (
                <span className="text-amber-700 font-medium">Pendiente</span>
              )}
              {capture.state === "approved" && (
                <span className="text-success font-medium">Aprobada</span>
              )}
              {capture.state === "rejected" && (
                <span className="text-destructive font-medium">Rechazada</span>
              )}
              {capture.state === "needs_info" && (
                <span className="text-blue-700 font-medium">Necesita info</span>
              )}
              {capture.state === "apply_failed" && (
                <span className="text-destructive font-medium">
                  Falló al aplicar
                </span>
              )}
            </dd>
          </dl>

          {capture.applyError && (
            <div className="text-sm text-destructive bg-red-50 border border-red-200 rounded px-3 py-2">
              <strong>Error al aplicar:</strong> {capture.applyError}
            </div>
          )}

          {capture.reviewNotes && (
            <div className="text-sm bg-muted rounded px-3 py-2">
              <strong>Nota de revisión:</strong> {capture.reviewNotes}
            </div>
          )}
        </div>

        {/* Columna derecha: payload y fotos */}
        <div className="bg-card border border-border rounded-lg p-5 flex flex-col gap-4">
          <h2 className="font-semibold">Datos enviados</h2>

          {currentTargetData && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground mb-1">
                Estado actual (para comparar)
              </h3>
              <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-48">
                {JSON.stringify(currentTargetData, null, 2)}
              </pre>
            </div>
          )}

          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-1">
              {currentTargetData ? "Cambios propuestos" : "Payload"}
            </h3>
            <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-64">
              {JSON.stringify(payload, null, 2)}
            </pre>
          </div>

          {photoUrls.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground mb-2">
                Fotos ({photoUrls.length})
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {photoUrls.map((p, i) => (
                  <a
                    key={p.storageKey}
                    href={p.url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block border border-border rounded overflow-hidden hover:opacity-90"
                  >
                    {p.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.url}
                        alt={`Foto ${i + 1}`}
                        className="w-full h-32 object-cover"
                      />
                    ) : (
                      <div className="w-full h-32 bg-muted flex items-center justify-center text-xs text-muted-foreground">
                        R2 no configurado
                      </div>
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {canAct && <ReviewActions captureId={capture.id} />}
    </div>
  );
}
