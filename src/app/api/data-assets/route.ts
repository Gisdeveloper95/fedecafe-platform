import { and, desc, eq, max } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db/client";
import { logAudit } from "@/lib/audit";
import { json, jsonError, parseJson } from "@/lib/api/json";
import { requireAdmin, requirePrincipal } from "@/lib/auth/principal";

const LAYER_TYPES = [
  "basemap",
  "ortofoto",
  "routing_db",
  "vias",
  "tuberias",
  "fotos_historicas",
] as const;

const CreateAssetRequest = z.object({
  key: z.string().min(1).max(120),
  layerType: z.enum(LAYER_TYPES),
  scope: z.string().min(1).max(120),
  storageKey: z.string().min(1),
  sizeBytes: z.number().int().nonnegative().optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  contentType: z.string().optional(),
  notes: z.string().max(500).optional(),
});

export async function GET(request: Request) {
  let principal;
  try {
    principal = await requirePrincipal(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope");
  const layerType = url.searchParams.get("layerType");
  const onlyLatest = url.searchParams.get("onlyLatest") === "true";

  const where = [];
  if (scope) where.push(eq(schema.dataAssets.scope, scope));
  if (layerType && (LAYER_TYPES as readonly string[]).includes(layerType)) {
    where.push(
      eq(schema.dataAssets.layerType, layerType as (typeof LAYER_TYPES)[number]),
    );
  }

  let assets;
  if (onlyLatest) {
    // Devolver solo la versión más reciente por (layerType, scope)
    const subq = db
      .select({
        key: schema.dataAssets.key,
        layerType: schema.dataAssets.layerType,
        scope: schema.dataAssets.scope,
        maxVer: max(schema.dataAssets.version).as("maxVer"),
      })
      .from(schema.dataAssets)
      .where(where.length > 0 ? and(...where) : undefined)
      .groupBy(schema.dataAssets.key)
      .as("latest");
    assets = await db
      .select()
      .from(schema.dataAssets)
      .innerJoin(
        subq,
        and(
          eq(schema.dataAssets.key, subq.key),
          eq(schema.dataAssets.version, subq.maxVer),
        ),
      );
    assets = assets.map((row) => row.data_assets);
  } else {
    assets = await db
      .select()
      .from(schema.dataAssets)
      .where(where.length > 0 ? and(...where) : undefined)
      .orderBy(desc(schema.dataAssets.publishedAt))
      .limit(500);
  }

  return json({ assets, source: principal.source });
}

export async function POST(request: Request) {
  let admin;
  try {
    admin = await requireAdmin(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  let body: z.infer<typeof CreateAssetRequest>;
  try {
    body = await parseJson(request, CreateAssetRequest);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  // Calcular siguiente version (auto-incrementa por key)
  const existing = await db
    .select({ maxVer: max(schema.dataAssets.version) })
    .from(schema.dataAssets)
    .where(eq(schema.dataAssets.key, body.key));
  const nextVersion = (existing[0]?.maxVer ?? 0) + 1;

  await db.insert(schema.dataAssets).values({
    key: body.key,
    layerType: body.layerType,
    scope: body.scope,
    version: nextVersion,
    storageKey: body.storageKey,
    sizeBytes: body.sizeBytes ?? null,
    sha256: body.sha256 ?? null,
    contentType: body.contentType ?? null,
    publishedBy: admin.userId,
    notes: body.notes ?? null,
  });

  await logAudit({
    userId: admin.userId,
    action: "asset.published",
    targetId: body.key,
    details: { version: nextVersion, layerType: body.layerType, scope: body.scope },
  });

  return json(
    {
      asset: {
        key: body.key,
        layerType: body.layerType,
        scope: body.scope,
        version: nextVersion,
        storageKey: body.storageKey,
        sizeBytes: body.sizeBytes,
        sha256: body.sha256,
      },
    },
    { status: 201 },
  );
}
