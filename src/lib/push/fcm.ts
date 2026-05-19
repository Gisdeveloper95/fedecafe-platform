import { eq, inArray } from "drizzle-orm";

import { db, schema } from "@/db/client";
import { env } from "@/lib/env";

/**
 * Cliente FCM Legacy HTTP. Funciona contra https://fcm.googleapis.com/fcm/send
 * con un Server Key (`FCM_SERVER_KEY`). Si no está configurado, los pushes se
 * loguean en consola — útil para que el resto del sistema funcione mientras
 * el cliente termina de configurar Firebase.
 *
 * Para producción real:
 *  1. Crear proyecto Firebase
 *  2. Project Settings → Cloud Messaging → copiar el "Server Key"
 *  3. Setear FCM_SERVER_KEY en Vercel
 */

const FCM_URL = "https://fcm.googleapis.com/fcm/send";

export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
  /// Identifica el tipo lógico para que el cliente sepa a qué pantalla saltar.
  /// ej: "ruta_asignada", "captura_aprobada", "captura_rechazada", "lockdown"
  kind: string;
};

export type PushResult = {
  delivery: "sent" | "logged" | "failed";
  tokens: number;
  success?: number;
  failure?: number;
  error?: string;
};

export function isFcmConfigured(): boolean {
  return Boolean(env.FCM_SERVER_KEY);
}

async function sendToTokens(
  tokens: string[],
  payload: PushPayload,
): Promise<PushResult> {
  if (tokens.length === 0) {
    return { delivery: "logged", tokens: 0 };
  }
  if (!env.FCM_SERVER_KEY) {
    console.log("[fcm] no configurado, push logueado:", {
      tokens: tokens.length,
      kind: payload.kind,
      title: payload.title,
    });
    return { delivery: "logged", tokens: tokens.length };
  }

  try {
    const res = await fetch(FCM_URL, {
      method: "POST",
      headers: {
        Authorization: `key=${env.FCM_SERVER_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        registration_ids: tokens,
        notification: {
          title: payload.title,
          body: payload.body,
          sound: "default",
        },
        data: {
          ...payload.data,
          kind: payload.kind,
        },
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      success?: number;
      failure?: number;
      results?: Array<{ error?: string }>;
    };
    if (!res.ok) {
      return {
        delivery: "failed",
        tokens: tokens.length,
        error: `HTTP ${res.status}`,
      };
    }
    return {
      delivery: "sent",
      tokens: tokens.length,
      success: data.success,
      failure: data.failure,
    };
  } catch (err) {
    return {
      delivery: "failed",
      tokens: tokens.length,
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}

/**
 * Envía push a todos los devices activos de un usuario.
 */
export async function pushToUser(
  userId: string,
  payload: PushPayload,
): Promise<PushResult> {
  const rows = await db
    .select({ token: schema.devicePushTokens.token })
    .from(schema.devicePushTokens)
    .where(eq(schema.devicePushTokens.userId, userId));
  return sendToTokens(rows.map((r) => r.token), payload);
}

/**
 * Envía push a todos los devices activos de un set de usuarios.
 */
export async function pushToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<PushResult> {
  if (userIds.length === 0) return { delivery: "logged", tokens: 0 };
  const rows = await db
    .select({ token: schema.devicePushTokens.token })
    .from(schema.devicePushTokens)
    .where(inArray(schema.devicePushTokens.userId, userIds));
  return sendToTokens(rows.map((r) => r.token), payload);
}

/**
 * Push a todos los admins (útil para "nueva captura pendiente").
 */
export async function pushToAdmins(payload: PushPayload): Promise<PushResult> {
  const admins = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.role, "admin"));
  return pushToUsers(admins.map((a) => a.id), payload);
}
