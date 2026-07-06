import { redirect } from "next/navigation";
import { getSessionUser, isFreshInstall } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");
  const fresh = isFreshInstall();

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-600 text-xl font-extrabold text-white shadow-lg shadow-accent-600/30">
            40
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Fourty</h1>
            <p className="mt-1 text-sm text-ink-muted">
              {fresh
                ? "Welcome! Create your admin account to get started."
                : "Sign in to your workspace"}
            </p>
          </div>
        </div>
        <LoginForm mode={fresh ? "setup" : "login"} />
      </div>
    </main>
  );
}
