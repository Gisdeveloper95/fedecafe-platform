import { createHash, randomUUID } from "node:crypto";

import { SignJWT, jwtVerify } from "jose";

import { env } from "@/lib/env";

const secretBytes = new TextEncoder().encode(env.MOBILE_JWT_SECRET);

export type MobileAccountType = "regular" | "demo";

export type MobileTokenPayload = {
  sub: string; // user id
  role: "admin" | "operario";
  username: string;
  device: string; // device fingerprint
  accountType: MobileAccountType;
  type: "access" | "refresh";
};

export async function signAccessToken(
  payload: Omit<MobileTokenPayload, "type">,
): Promise<string> {
  return new SignJWT({ ...payload, type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("fedecafe-platform")
    .setAudience("fedecafe-mobile")
    .setExpirationTime(`${env.MOBILE_ACCESS_TOKEN_TTL_MIN}m`)
    .sign(secretBytes);
}

export async function signRefreshToken(
  payload: Omit<MobileTokenPayload, "type">,
  ttlSeconds?: number,
): Promise<string> {
  const ttl = ttlSeconds ?? defaultRefreshTtlSec(payload.accountType);
  return new SignJWT({ ...payload, type: "refresh", jti: randomUUID() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("fedecafe-platform")
    .setAudience("fedecafe-mobile")
    .setExpirationTime(`${ttl}s`)
    .sign(secretBytes);
}

export async function verifyMobileToken(
  token: string,
): Promise<MobileTokenPayload> {
  const { payload } = await jwtVerify(token, secretBytes, {
    issuer: "fedecafe-platform",
    audience: "fedecafe-mobile",
  });
  return payload as unknown as MobileTokenPayload;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function defaultRefreshTtlSec(accountType: MobileAccountType): number {
  const days =
    accountType === "demo"
      ? env.MOBILE_REFRESH_TOKEN_TTL_DAYS_DEMO
      : env.MOBILE_REFRESH_TOKEN_TTL_DAYS;
  return days * 24 * 60 * 60;
}

// Calcula TTL efectivo en segundos respetando:
//   - El TTL base por tipo de cuenta
//   - La fecha de expiración de acceso del usuario (demo: token, regular: bloqueo manual)
// Si accessExpiresAt está vencido, retorna 0 (el caller debe rechazar).
export function effectiveRefreshTtlSec(args: {
  accountType: MobileAccountType;
  accessExpiresAt?: string | null;
}): number {
  const base = defaultRefreshTtlSec(args.accountType);
  if (!args.accessExpiresAt) return base;

  const expiresAtMs = new Date(args.accessExpiresAt).getTime();
  if (Number.isNaN(expiresAtMs)) return base;

  const remainingSec = Math.floor((expiresAtMs - Date.now()) / 1000);
  if (remainingSec <= 0) return 0;
  return Math.min(base, remainingSec);
}
