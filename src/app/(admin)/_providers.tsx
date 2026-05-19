"use client";

import { DialogProvider } from "@/components/ui/modal";
import { ToastProvider } from "@/components/ui/toast";

/**
 * Providers UI compartidos por todas las pantallas admin: modales y toasts.
 * Reemplaza el uso de window.alert/confirm/prompt nativos.
 */
export function AdminUIProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <DialogProvider>{children}</DialogProvider>
    </ToastProvider>
  );
}
