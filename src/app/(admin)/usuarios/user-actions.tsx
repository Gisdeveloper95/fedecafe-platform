"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

type Status = "active" | "suspended" | "deleted";

export function UserActions({
  userId,
  status,
  isSelf,
  hasEmail,
}: {
  userId: string;
  status: Status;
  isSelf: boolean;
  hasEmail: boolean;
}) {
  const router = useRouter();
  const dialog = useDialog();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  async function setStatus(next: Status, msg: string) {
    const ok = await dialog.confirm({
      title:
        next === "suspended"
          ? "Suspender usuario"
          : next === "active"
          ? "Reactivar usuario"
          : "Cambiar estado",
      message: msg,
      danger: next === "suspended" || next === "deleted",
      confirmLabel:
        next === "suspended"
          ? "Suspender"
          : next === "active"
          ? "Reactivar"
          : "Continuar",
    });
    if (!ok) return;
    setLoading(true);
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data?.error ?? "No se pudo actualizar el estado");
      return;
    }
    toast.success(
      next === "suspended"
        ? "Usuario suspendido. Sus sesiones móviles fueron revocadas."
        : next === "active"
        ? "Usuario reactivado."
        : "Estado actualizado.",
    );
    router.refresh();
  }

  async function softDelete() {
    const ok = await dialog.confirm({
      title: "Eliminar usuario",
      message: "Eliminar este usuario? Se podrá restaurar luego.",
      danger: true,
      confirmLabel: "Eliminar",
    });
    if (!ok) return;
    setLoading(true);
    const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data?.error ?? "No se pudo eliminar");
      return;
    }
    toast.success("Usuario eliminado");
    router.refresh();
  }

  async function resetPassword() {
    const newPassword = await dialog.prompt({
      title: "Restablecer contraseña",
      message:
        "Define una contraseña temporal. El usuario tendrá que cambiarla en su próximo inicio de sesión.",
      label: "Nueva contraseña",
      placeholder: "Mínimo 6 caracteres",
      required: true,
      validate: (v) =>
        v.length < 6 ? "Debe tener al menos 6 caracteres" : null,
      okLabel: "Actualizar",
    });
    if (!newPassword) return;
    setLoading(true);
    const res = await fetch(`/api/users/${userId}/password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ newPassword }),
    });
    setLoading(false);
    if (!res.ok) {
      toast.error("Error al cambiar contraseña");
      return;
    }
    toast.success(
      "Contraseña actualizada. Las sesiones móviles fueron revocadas.",
    );
  }

  async function sendResetByEmail() {
    if (!hasEmail) {
      await dialog.alert({
        title: "Sin correo registrado",
        message:
          "Este usuario no tiene correo electrónico. Agrégalo en su perfil antes de enviar el enlace de restablecimiento.",
        tone: "warning",
      });
      return;
    }
    const ok = await dialog.confirm({
      title: "Enviar enlace de restablecimiento",
      message:
        "Se enviará un correo con un enlace para que el usuario defina una contraseña nueva. El enlace es válido por 1 hora.",
      confirmLabel: "Enviar correo",
    });
    if (!ok) return;
    setLoading(true);
    const res = await fetch(`/api/users/${userId}/send-reset`, {
      method: "POST",
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data?.error ?? "No se pudo enviar el correo");
      return;
    }
    toast.success("Correo de restablecimiento enviado.");
  }

  return (
    <div className="flex gap-2 justify-end flex-wrap">
      <button
        onClick={resetPassword}
        disabled={loading}
        className="text-xs border border-border rounded px-2 py-1 hover:bg-muted disabled:opacity-50"
      >
        Reset password
      </button>
      <button
        onClick={sendResetByEmail}
        disabled={loading}
        className="text-xs border border-border rounded px-2 py-1 hover:bg-muted disabled:opacity-50"
        title={
          hasEmail
            ? "Envía enlace de restablecimiento al correo del usuario"
            : "El usuario no tiene correo registrado"
        }
      >
        Enviar reset por correo
      </button>
      {!isSelf && status === "active" && (
        <button
          onClick={() =>
            setStatus(
              "suspended",
              "Suspender este usuario? Se revocan sus sesiones y no podrá hacer login.",
            )
          }
          disabled={loading}
          className="text-xs border border-amber-500 text-amber-700 rounded px-2 py-1 hover:bg-amber-50 disabled:opacity-50"
        >
          Suspender
        </button>
      )}
      {!isSelf && status === "suspended" && (
        <button
          onClick={() => setStatus("active", "Reactivar este usuario?")}
          disabled={loading}
          className="text-xs border border-success text-success rounded px-2 py-1 hover:bg-green-50 disabled:opacity-50"
        >
          Reactivar
        </button>
      )}
      {!isSelf && status === "deleted" && (
        <button
          onClick={() =>
            setStatus("active", "Restaurar este usuario como activo?")
          }
          disabled={loading}
          className="text-xs border border-success text-success rounded px-2 py-1 hover:bg-green-50 disabled:opacity-50"
        >
          Restaurar
        </button>
      )}
      {!isSelf && status !== "deleted" && (
        <button
          onClick={softDelete}
          disabled={loading}
          className="text-xs border border-destructive text-destructive rounded px-2 py-1 hover:bg-red-50 disabled:opacity-50"
        >
          Eliminar
        </button>
      )}
    </div>
  );
}
