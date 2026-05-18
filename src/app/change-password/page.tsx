import { redirect } from "next/navigation";

import { getWebSessionUser } from "@/lib/auth/web-session";

import { ChangePasswordForm } from "./change-password-form";

export default async function ChangePasswordPage() {
  const user = await getWebSessionUser();
  if (!user) redirect("/login");
  if (user.status !== "active") redirect("/login?suspended=1");

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-md bg-card rounded-lg border border-border shadow-sm p-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-brand">Cambiar contraseña</h1>
          {user.mustChangePassword && (
            <p className="text-sm text-amber-600 mt-2">
              Debes cambiar tu contraseña antes de continuar.
            </p>
          )}
        </div>
        <ChangePasswordForm userId={user.id} />
      </div>
    </div>
  );
}
