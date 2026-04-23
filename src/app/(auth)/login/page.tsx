import { redirect } from "next/navigation";

import { getWebSessionUser } from "@/lib/auth/web-session";

import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await getWebSessionUser();
  if (user) redirect("/dashboard");

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-card rounded-lg border border-border shadow-sm p-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-brand">Fedecafe Platform</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Administracion y seguimiento
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
