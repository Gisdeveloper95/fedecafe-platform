import { redirect } from "next/navigation";

import { getWebSessionUser } from "@/lib/auth/web-session";

export default async function Home() {
  const user = await getWebSessionUser();
  if (user) redirect("/dashboard");
  redirect("/login");
}
