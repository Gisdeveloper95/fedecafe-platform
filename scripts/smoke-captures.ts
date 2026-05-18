import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

try {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000";

function bold(s: string) {
  return "\n=== " + s + " ===";
}

async function main() {
  console.log(bold("Smoke E2E captures + R2 contra " + BASE));

  // 1. Login admin
  const loginAdmin = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  });
  const adminCookie = loginAdmin.headers.get("set-cookie")?.split(";")[0] ?? "";
  console.log("admin cookie:", adminCookie.slice(0, 40), "...");

  // 2. Crear operario de prueba
  const opName = "op_smoke_" + Math.random().toString(36).slice(2, 6);
  const createOp = await fetch(`${BASE}/api/users`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: adminCookie },
    body: JSON.stringify({
      username: opName,
      fullName: "Operario Smoke R2",
      role: "operario",
      password: "smoke123",
      mustChangePassword: false,
    }),
  });
  const opData = (await createOp.json()) as { user: { id: string } };
  console.log("operario creado:", opName, "id:", opData.user.id);

  // 3. Login operario mobile
  const loginOp = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: opName,
      password: "smoke123",
      mobile: true,
      deviceFingerprint: "smoke-r2-device",
    }),
  });
  const opLogin = (await loginOp.json()) as { accessToken: string };
  const access = opLogin.accessToken;
  console.log("operario access token: ok");

  // 4. Pedir presigned URL para foto
  const captureId = randomUUID();
  console.log(bold("Captura ID: " + captureId));

  const presignRes = await fetch(`${BASE}/api/captures/presign`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${access}`,
    },
    body: JSON.stringify({
      captureId,
      files: [{ index: 0, contentType: "image/jpeg", ext: "jpg" }],
    }),
  });
  if (!presignRes.ok) {
    console.error("presign falló:", presignRes.status, await presignRes.text());
    process.exit(1);
  }
  const presign = (await presignRes.json()) as {
    uploads: { uploadUrl: string; storageKey: string }[];
  };
  const { uploadUrl, storageKey } = presign.uploads[0];
  console.log("presigned storageKey:", storageKey);

  // 5. Subir foto (mock JPEG: 1x1 pixel)
  const tinyJpeg = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
    0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
    0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
    0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
    0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x10, 0x01, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
    0xfb, 0xff, 0xd9,
  ]);
  writeFileSync("/tmp/smoke.jpg", tinyJpeg);
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": "image/jpeg" },
    body: tinyJpeg,
  });
  console.log("PUT R2 status:", uploadRes.status);
  if (!uploadRes.ok) {
    console.error(await uploadRes.text());
    process.exit(1);
  }

  // 6. Confirmar captura
  const captureRes = await fetch(`${BASE}/api/captures`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${access}`,
    },
    body: JSON.stringify({
      id: captureId,
      opType: "create_medidor",
      targetType: "medidor",
      payload: {
        contrato: "SMOKE-R2-" + Math.random().toString(36).slice(2, 6),
        nombre: "Medidor smoke con foto",
        latitude: 4.5361,
        longitude: -75.8098,
        municipio: "La Tebaida",
      },
      capturedAt: new Date().toISOString(),
      gps: { lat: 4.5361, lon: -75.8098, accuracy: 5 },
      attachments: [storageKey],
    }),
  });
  const captureBody = await captureRes.json();
  console.log("POST captures status:", captureRes.status);
  console.log("body:", JSON.stringify(captureBody));

  if (!captureRes.ok) {
    console.error("captura falló");
    process.exit(1);
  }

  // 7. Admin ve el detalle y obtiene URL firmada de descarga
  const detailRes = await fetch(`${BASE}/api/captures/${captureId}`, {
    headers: { cookie: adminCookie },
  });
  const detail = (await detailRes.json()) as {
    capture: {
      state: string;
      attachments: { downloadUrl?: string; storageKey: string }[];
    };
  };
  console.log("detail.state:", detail.capture.state);
  console.log(
    "downloadUrl:",
    detail.capture.attachments[0]?.downloadUrl?.slice(0, 80),
    "...",
  );

  // 8. Verifico que la foto se puede bajar
  const downloadRes = await fetch(
    detail.capture.attachments[0].downloadUrl ?? "",
  );
  console.log(
    "GET firmada status:",
    downloadRes.status,
    "size:",
    Number(downloadRes.headers.get("content-length")),
  );

  // 9. Admin aprueba
  const approveRes = await fetch(
    `${BASE}/api/captures/${captureId}/approve`,
    {
      method: "POST",
      headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify({ notes: "Aprobado en smoke" }),
    },
  );
  const approve = await approveRes.json();
  console.log("approve:", JSON.stringify(approve));

  console.log(bold("✓ Smoke E2E completo"));
  console.log(
    "Limpieza manual si quieres: borra el medidor creado con el contrato del paso 6.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
