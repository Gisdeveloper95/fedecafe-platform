import {
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "@/lib/env";

// Cliente Cloudflare R2 (S3-compatible).
// Si las credenciales no están seteadas, los métodos lanzan al usarse — pero
// permitimos importarlo sin crash para entornos de dev sin R2 configurado.

let cachedClient: S3Client | null = null;

function getClient(): S3Client {
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new Error("r2_not_configured");
  }
  if (cachedClient) return cachedClient;
  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
  return cachedClient;
}

export function isR2Configured(): boolean {
  return Boolean(
    env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET,
  );
}

export type PresignedUpload = {
  uploadUrl: string;
  storageKey: string;
  expiresInSec: number;
};

export async function presignUpload(args: {
  storageKey: string;
  contentType?: string;
  expiresInSec?: number;
  contentLength?: number;
}): Promise<PresignedUpload> {
  const client = getClient();
  const expiresInSec = args.expiresInSec ?? 3600;
  const cmd = new PutObjectCommand({
    Bucket: env.R2_BUCKET!,
    Key: args.storageKey,
    ContentType: args.contentType,
    ContentLength: args.contentLength,
  });
  const uploadUrl = await getSignedUrl(client, cmd, { expiresIn: expiresInSec });
  return { uploadUrl, storageKey: args.storageKey, expiresInSec };
}

export type PresignedDownload = {
  downloadUrl: string;
  storageKey: string;
  expiresInSec: number;
};

export async function presignDownload(args: {
  storageKey: string;
  expiresInSec?: number;
}): Promise<PresignedDownload> {
  const client = getClient();
  const expiresInSec = args.expiresInSec ?? 3600;
  const cmd = new GetObjectCommand({
    Bucket: env.R2_BUCKET!,
    Key: args.storageKey,
  });
  const downloadUrl = await getSignedUrl(client, cmd, { expiresIn: expiresInSec });
  return { downloadUrl, storageKey: args.storageKey, expiresInSec };
}

export type HeadResult = {
  exists: boolean;
  sizeBytes?: number;
  contentType?: string;
  etag?: string;
};

export async function headObject(storageKey: string): Promise<HeadResult> {
  try {
    const client = getClient();
    const res = await client.send(
      new HeadObjectCommand({
        Bucket: env.R2_BUCKET!,
        Key: storageKey,
      }),
    );
    return {
      exists: true,
      sizeBytes: res.ContentLength,
      contentType: res.ContentType,
      etag: res.ETag,
    };
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "$metadata" in err &&
      (err as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode === 404
    ) {
      return { exists: false };
    }
    throw err;
  }
}

export async function deleteObject(storageKey: string): Promise<void> {
  const client = getClient();
  await client.send(
    new DeleteObjectCommand({
      Bucket: env.R2_BUCKET!,
      Key: storageKey,
    }),
  );
}

// ---------------------------------------------------------------------------
// Path builders (convenciones)
// ---------------------------------------------------------------------------

export function buildCapturePhotoKey(args: {
  captureId: string;
  index: number;
  ext?: string;
}): string {
  const ext = (args.ext ?? "jpg").replace(/^\./, "");
  return `captures/${args.captureId}/${args.index}.${ext}`;
}

export function buildAssetKey(args: {
  layerType: string;
  scope: string;
  version: number;
  filename: string;
}): string {
  return `assets/${args.layerType}/${args.scope}/v${args.version}/${args.filename}`;
}
