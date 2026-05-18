import { env } from "@/lib/env";

// Cliente mínimo para Resend sin SDK (evita una dependencia extra).
// Si RESEND_API_KEY no está configurado, los emails se loguean en consola y se
// reportan como "queued" para que el sistema funcione en dev sin credenciales.

export type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type EmailResult = {
  ok: boolean;
  id?: string;
  delivery: "sent" | "logged" | "failed";
  error?: string;
};

const RESEND_URL = "https://api.resend.com/emails";

export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  if (!env.RESEND_API_KEY) {
    console.warn("[email/resend] RESEND_API_KEY no configurado. Email logueado:");
    console.warn(`  to: ${payload.to}`);
    console.warn(`  subject: ${payload.subject}`);
    if (payload.text) {
      console.warn(`  text: ${payload.text}`);
    }
    return { ok: true, delivery: "logged" };
  }

  try {
    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.RESEND_FROM,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };
    if (!response.ok) {
      return {
        ok: false,
        delivery: "failed",
        error: data.message ?? `HTTP ${response.status}`,
      };
    }
    return { ok: true, id: data.id, delivery: "sent" };
  } catch (err) {
    return {
      ok: false,
      delivery: "failed",
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}

// ---------------------------------------------------------------------------
// Plantillas
// ---------------------------------------------------------------------------

function brandedHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr><td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
          <tr><td style="background:#0f4d3a;padding:20px 24px;color:#ffffff;font-size:18px;font-weight:600;">Fedecafe — Plataforma</td></tr>
          <tr><td style="padding:24px;">
            <h2 style="margin:0 0 16px 0;font-size:18px;color:#111827;">${title}</h2>
            ${body}
          </td></tr>
          <tr><td style="padding:16px 24px;font-size:12px;color:#6b7280;background:#f9fafb;">Este es un mensaje automático. No respondas a este correo.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function renderCredentialsEmail(args: {
  fullName: string;
  username: string;
  tempPassword: string;
  loginUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = "Tus credenciales de acceso — Fedecafe";
  const body = `
<p style="color:#374151;line-height:1.5;">Hola ${args.fullName},</p>
<p style="color:#374151;line-height:1.5;">Tu cuenta ha sido creada en la plataforma. Usa estas credenciales para iniciar sesión:</p>
<table style="margin:16px 0;border-collapse:collapse;width:100%;font-family:monospace;background:#f3f4f6;border-radius:6px;">
  <tr><td style="padding:10px 14px;color:#6b7280;width:100px;">Usuario</td><td style="padding:10px 14px;color:#111827;">${args.username}</td></tr>
  <tr><td style="padding:10px 14px;color:#6b7280;">Contraseña</td><td style="padding:10px 14px;color:#111827;">${args.tempPassword}</td></tr>
</table>
<p style="color:#374151;line-height:1.5;">Por seguridad, al iniciar sesión se te pedirá cambiar la contraseña.</p>
<p style="margin:24px 0;"><a href="${args.loginUrl}" style="background:#0f4d3a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;">Iniciar sesión</a></p>
`;
  const text = `Hola ${args.fullName},

Tu cuenta ha sido creada en la plataforma Fedecafe.

Usuario: ${args.username}
Contraseña: ${args.tempPassword}

Al iniciar sesión se te pedirá cambiar la contraseña.

Acceso: ${args.loginUrl}
`;
  return { subject, html: brandedHtml(subject, body), text };
}

export function renderPasswordResetEmail(args: {
  fullName: string;
  resetUrl: string;
  ttlMinutes: number;
}): { subject: string; html: string; text: string } {
  const subject = "Recuperación de contraseña — Fedecafe";
  const body = `
<p style="color:#374151;line-height:1.5;">Hola ${args.fullName},</p>
<p style="color:#374151;line-height:1.5;">Recibimos una solicitud para restablecer tu contraseña. Si no fuiste tú, ignora este correo.</p>
<p style="margin:24px 0;"><a href="${args.resetUrl}" style="background:#0f4d3a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;">Restablecer contraseña</a></p>
<p style="color:#6b7280;font-size:12px;">El enlace expira en ${args.ttlMinutes} minutos.</p>
`;
  const text = `Hola ${args.fullName},

Recibimos una solicitud para restablecer tu contraseña. Si no fuiste tú, ignora este correo.

Enlace: ${args.resetUrl}

El enlace expira en ${args.ttlMinutes} minutos.
`;
  return { subject, html: brandedHtml(subject, body), text };
}

export function renderDemoTokenEmail(args: {
  toName: string;
  code: string;
  expiresAt: string;
}): { subject: string; html: string; text: string } {
  const subject = "Tu código de acceso demo — Fedecafe";
  const body = `
<p style="color:#374151;line-height:1.5;">Hola ${args.toName},</p>
<p style="color:#374151;line-height:1.5;">Este es tu código de acceso demo. Ingrésalo en la app móvil para activar tu sesión:</p>
<div style="font-size:32px;letter-spacing:8px;font-weight:700;color:#0f4d3a;text-align:center;padding:18px;background:#f3f4f6;border-radius:8px;margin:18px 0;font-family:monospace;">${args.code}</div>
<p style="color:#6b7280;font-size:13px;">Vigente hasta: ${args.expiresAt}</p>
`;
  const text = `Hola ${args.toName},

Tu código de acceso demo es: ${args.code}

Vigente hasta: ${args.expiresAt}
`;
  return { subject, html: brandedHtml(subject, body), text };
}
