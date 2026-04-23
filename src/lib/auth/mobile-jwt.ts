import { createHash, randomUUID } from "node:crypto";

import { SignJWT, jwtVerify } from "jose";

import { env } from "@/lib/env";

const secretBytes = new TextEncoder().encode(env.MOBILE_JWT_SECRET);

export type MobileTokenPayload = {
  sub: string; // user id
  role: "admin" | "operario";
  username: string;
  device: string; // device fingerprint
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
): Promise<string> {
  return new SignJWT({ ...payload, type: "refresh", jti: randomUUID() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("fedecafe-platform")
    .setAudience("fedecafe-mobile")
    .setExpirationTime(`${env.MOBILE_REFRESH_TOKEN_TTL_DAYS}d`)
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
