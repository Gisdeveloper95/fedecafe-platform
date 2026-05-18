import { readFileSync } from "node:fs";

try {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

import {
  CreateBucketCommand,
  ListBucketsCommand,
  S3Client,
} from "@aws-sdk/client-s3";

async function main() {
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

  const list = await client.send(new ListBucketsCommand({}));
  const buckets = list.Buckets?.map((b) => b.Name) ?? [];
  console.log("Buckets existentes:", buckets);

  const target = process.env.R2_BUCKET ?? "fedecafe-storage";
  if (buckets.includes(target)) {
    console.log("[OK] Bucket '" + target + "' ya existe.");
    return;
  }

  console.log("[creando] " + target);
  await client.send(new CreateBucketCommand({ Bucket: target }));
  console.log("[OK] creado.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
