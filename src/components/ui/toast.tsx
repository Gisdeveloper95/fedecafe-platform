"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type ToastTone = "info" | "success" | "warning" | "error";

type Toast = {
  id: string;
  message: string;
  tone: ToastTone;
};

type ToastApi = {
  show: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const api = useMemo<ToastApi>(() => {
    const show = (message: string, tone: ToastTone = "info") => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, tone }]);
      setTimeout(() => remove(id), tone === "error" ? 7000 : 4000);
    };
    return {
      show,
      success: (m) => show(m, "success"),
      error: (m) => show(m, "error"),
      warning: (m) => show(m, "warning"),
    };
  }, [remove]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-lg shadow-lg px-4 py-3 text-sm text-white max-w-sm flex items-start gap-2 animate-in slide-in-from-bottom-2 duration-200 ${toneClass(
              t.tone,
            )}`}
            onClick={() => remove(t.id)}
          >
            <span className="font-medium">{toneIcon(t.tone)}</span>
            <span className="flex-1 whitespace-pre-line">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function toneClass(t: ToastTone): string {
  switch (t) {
    case "success":
      return "bg-green-600";
    case "warning":
      return "bg-amber-600";
    case "error":
      return "bg-red-600";
    default:
      return "bg-brand";
  }
}

function toneIcon(t: ToastTone): string {
  switch (t) {
    case "success":
      return "✓";
    case "warning":
      return "⚠";
    case "error":
      return "✕";
    default:
      return "•";
  }
}
