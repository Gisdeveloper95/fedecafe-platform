import { desc, max } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db, schema } from "@/db/client";
import { getWebSessionUser } from "@/lib/auth/web-session";

import { AssetsList } from "./assets-list";

const LAYER_LABEL: Record<string, string> = {
  basemap: "Basemaps (OSM, etc.)",
  ortofoto: "Ortofotos",
  routing_db: "Routing DB",
  vias: "Vías",
  tuberias: "Tuberías",
  fotos_historicas: "Fotos históricas",
};

export default async function AssetsPage() {
  const me = await getWebSessionUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/dashboard");

  // Última versión por key (devuelve todas las filas y el cliente agrupa)
  const rows = await db
    .select()
    .from(schema.dataAssets)
    .orderBy(desc(schema.dataAssets.publishedAt))
    .limit(500);

  // Agrupar por key, mostrar la última versión y conteo total
  const byKey = new Map<
    string,
    {
      key: string;
      layerType: string;
      scope: string | null;
      latestVersion: number;
      totalVersions: number;
      latestPublishedAt: string;
      sizeBytes: number | null;
      latestRow: (typeof rows)[number];
    }
  >();
  for (const r of rows) {
    const existing = byKey.get(r.key);
    if (!existing) {
      byKey.set(r.key, {
        key: r.key,
        layerType: r.layerType,
        scope: r.scope,
        latestVersion: r.version,
        totalVersions: 1,
        latestPublishedAt: r.publishedAt,
        sizeBytes: r.sizeBytes,
        latestRow: r,
      });
    } else {
      existing.totalVersions++;
      if (r.version > existing.latestVersion) {
        existing.latestVersion = r.version;
        existing.latestPublishedAt = r.publishedAt;
        existing.sizeBytes = r.sizeBytes;
        existing.latestRow = r;
      }
    }
  }
  const assets = Array.from(byKey.values());

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Assets publicados</h1>
        <p className="text-muted-foreground text-sm">
          Basemaps, ortofotos y otros archivos pesados publicados a R2 desde
          rutas_builder. Descarga directa al PC del usuario (streaming desde R2,
          no pasa por el servidor de la app).
        </p>
      </div>

      <AssetsList
        assets={assets.map((a) => ({
          key: a.key,
          layerType: a.layerType,
          layerLabel: LAYER_LABEL[a.layerType] ?? a.layerType,
          scope: a.scope,
          latestVersion: a.latestVersion,
          totalVersions: a.totalVersions,
          latestPublishedAt: a.latestPublishedAt,
          sizeBytes: a.sizeBytes,
        }))}
      />
    </div>
  );
}
