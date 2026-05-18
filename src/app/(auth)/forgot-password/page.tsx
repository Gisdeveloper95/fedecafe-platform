import { ForgotForm } from "./forgot-form";

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-card rounded-lg border border-border shadow-sm p-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-brand">
            Recuperar contraseña
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Te enviaremos un enlace por correo si la cuenta existe.
          </p>
        </div>
        <ForgotForm />
        <div className="mt-4 text-center">
          <a
            href="/login"
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Volver al login
          </a>
        </div>
      </div>
    </div>
  );
}
