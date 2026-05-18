import { ResetForm } from "./reset-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const sp = await searchParams;
  const token = sp.token ?? "";

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-card rounded-lg border border-border shadow-sm p-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-brand">Nueva contraseña</h1>
        </div>
        {token ? (
          <ResetForm token={token} />
        ) : (
          <div className="text-sm text-destructive">
            El enlace es inválido. Solicita uno nuevo.
          </div>
        )}
      </div>
    </div>
  );
}
