"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// =============================================================================
// Primitivos de modal reusable
// =============================================================================
// Reemplaza window.alert/window.confirm/window.prompt con UI coherente.
//
// Uso desde un componente cliente:
//   const dialog = useDialog();
//   await dialog.alert({ title, message });
//   const ok = await dialog.confirm({ title, message, confirmLabel, danger: true });
//   const text = await dialog.prompt({ title, label, defaultValue });
//
// El <DialogProvider /> debe estar montado en el árbol (admin layout).

export type AlertOptions = {
  title?: string;
  message: string;
  okLabel?: string;
  tone?: "info" | "success" | "warning" | "danger";
};

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

export type PromptOptions = {
  title?: string;
  message?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  multiline?: boolean;
  required?: boolean;
  okLabel?: string;
  cancelLabel?: string;
  validate?: (value: string) => string | null;
};

type Dialog =
  | { kind: "alert"; opts: AlertOptions; resolve: (v: void) => void }
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: "prompt"; opts: PromptOptions; resolve: (v: string | null) => void };

type DialogApi = {
  alert: (opts: AlertOptions) => Promise<void>;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
};

const DialogContext = createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error("useDialog must be used inside <DialogProvider>");
  }
  return ctx;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<Dialog | null>(null);

  const api = useMemo<DialogApi>(
    () => ({
      alert: (opts) =>
        new Promise<void>((resolve) =>
          setCurrent({ kind: "alert", opts, resolve }),
        ),
      confirm: (opts) =>
        new Promise<boolean>((resolve) =>
          setCurrent({ kind: "confirm", opts, resolve }),
        ),
      prompt: (opts) =>
        new Promise<string | null>((resolve) =>
          setCurrent({ kind: "prompt", opts, resolve }),
        ),
    }),
    [],
  );

  const close = useCallback(() => setCurrent(null), []);

  return (
    <DialogContext.Provider value={api}>
      {children}
      {current && <DialogRenderer dialog={current} onClose={close} />}
    </DialogContext.Provider>
  );
}

function toneColors(tone: AlertOptions["tone"] = "info") {
  switch (tone) {
    case "success":
      return {
        bar: "bg-green-500",
        ring: "ring-green-200",
        button: "bg-green-600 hover:bg-green-700",
      };
    case "warning":
      return {
        bar: "bg-amber-500",
        ring: "ring-amber-200",
        button: "bg-amber-600 hover:bg-amber-700",
      };
    case "danger":
      return {
        bar: "bg-red-500",
        ring: "ring-red-200",
        button: "bg-red-600 hover:bg-red-700",
      };
    default:
      return {
        bar: "bg-brand",
        ring: "ring-brand/20",
        button: "bg-brand hover:opacity-90",
      };
  }
}

function DialogRenderer({
  dialog,
  onClose,
}: {
  dialog: Dialog;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState(
    dialog.kind === "prompt" ? dialog.opts.defaultValue ?? "" : "",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Autofocus + cerrar con Escape
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (dialog.kind === "alert") dialog.resolve();
        else if (dialog.kind === "confirm") dialog.resolve(false);
        else dialog.resolve(null);
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [dialog, onClose]);

  function handleSubmit() {
    if (dialog.kind === "alert") {
      dialog.resolve();
    } else if (dialog.kind === "confirm") {
      dialog.resolve(true);
    } else {
      const trimmed = value.trim();
      if (dialog.opts.required && !trimmed) {
        setError("Este campo es requerido");
        return;
      }
      if (dialog.opts.validate) {
        const err = dialog.opts.validate(value);
        if (err) {
          setError(err);
          return;
        }
      }
      dialog.resolve(value);
    }
    onClose();
  }

  function handleCancel() {
    if (dialog.kind === "alert") dialog.resolve();
    else if (dialog.kind === "confirm") dialog.resolve(false);
    else dialog.resolve(null);
    onClose();
  }

  const tone =
    dialog.kind === "confirm" && dialog.opts.danger
      ? "danger"
      : dialog.kind === "alert"
      ? dialog.opts.tone
      : "info";
  const colors = toneColors(tone);

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleCancel();
      }}
    >
      <div
        className={`bg-card border border-border rounded-lg shadow-xl max-w-md w-full overflow-hidden ring-4 ${colors.ring}`}
      >
        <div className={`h-1 w-full ${colors.bar}`} />
        <div className="p-6 flex flex-col gap-4">
          {dialog.kind === "alert" && (
            <>
              {dialog.opts.title && (
                <h3 className="font-semibold text-lg">{dialog.opts.title}</h3>
              )}
              <p className="text-sm text-foreground whitespace-pre-line">
                {dialog.opts.message}
              </p>
              <div className="flex justify-end">
                <button
                  onClick={handleSubmit}
                  className={`text-white rounded px-4 py-2 text-sm font-medium ${colors.button}`}
                >
                  {dialog.opts.okLabel ?? "Entendido"}
                </button>
              </div>
            </>
          )}

          {dialog.kind === "confirm" && (
            <>
              {dialog.opts.title && (
                <h3 className="font-semibold text-lg">{dialog.opts.title}</h3>
              )}
              <p className="text-sm text-foreground whitespace-pre-line">
                {dialog.opts.message}
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={handleCancel}
                  className="border border-border rounded px-4 py-2 text-sm hover:bg-muted"
                >
                  {dialog.opts.cancelLabel ?? "Cancelar"}
                </button>
                <button
                  onClick={handleSubmit}
                  className={`text-white rounded px-4 py-2 text-sm font-medium ${colors.button}`}
                >
                  {dialog.opts.confirmLabel ?? "Confirmar"}
                </button>
              </div>
            </>
          )}

          {dialog.kind === "prompt" && (
            <>
              {dialog.opts.title && (
                <h3 className="font-semibold text-lg">{dialog.opts.title}</h3>
              )}
              {dialog.opts.message && (
                <p className="text-sm text-muted-foreground">
                  {dialog.opts.message}
                </p>
              )}
              <label className="flex flex-col gap-1">
                {dialog.opts.label && (
                  <span className="text-xs font-medium">
                    {dialog.opts.label}
                  </span>
                )}
                {dialog.opts.multiline ? (
                  <textarea
                    ref={(el) => {
                      inputRef.current = el;
                    }}
                    value={value}
                    onChange={(e) => {
                      setValue(e.target.value);
                      setError(null);
                    }}
                    rows={4}
                    placeholder={dialog.opts.placeholder}
                    className="border border-border rounded px-3 py-2 bg-background text-sm"
                  />
                ) : (
                  <input
                    ref={(el) => {
                      inputRef.current = el;
                    }}
                    type="text"
                    value={value}
                    onChange={(e) => {
                      setValue(e.target.value);
                      setError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSubmit();
                      }
                    }}
                    placeholder={dialog.opts.placeholder}
                    className="border border-border rounded px-3 py-2 bg-background text-sm"
                  />
                )}
                {error && (
                  <span className="text-xs text-destructive">{error}</span>
                )}
              </label>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={handleCancel}
                  className="border border-border rounded px-4 py-2 text-sm hover:bg-muted"
                >
                  {dialog.opts.cancelLabel ?? "Cancelar"}
                </button>
                <button
                  onClick={handleSubmit}
                  className={`text-white rounded px-4 py-2 text-sm font-medium ${colors.button}`}
                >
                  {dialog.opts.okLabel ?? "Guardar"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
