import { redirect } from "next/navigation";
import { getSessionUser, isFreshInstall } from "@/lib/auth";
import { listLoginProviders } from "@/lib/sso/provision";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

// Human-readable copy for the sso_error codes the SSO routes redirect back with.
const SSO_ERRORS: Record<string, string> = {
  unknown_or_disabled_provider: "That sign-in provider is unavailable.",
  provider_discovery_failed: "Couldn't reach the sign-in provider. Try again.",
  missing_code_or_state: "The sign-in response was incomplete. Try again.",
  invalid_or_expired_state: "Your sign-in link expired. Try again.",
  sso_login_failed: "Single sign-on failed. Contact your administrator.",
};

function ssoErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  if (SSO_ERRORS[code]) return SSO_ERRORS[code];
  if (code.startsWith("provider_error:")) return "The sign-in provider reported an error.";
  return "Single sign-on failed. Try again.";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sso_error?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");
  const fresh = await isFreshInstall();
  // SSO is offered only for returning installs (a fresh install has no workspace
  // to JIT-provision users into yet).
  const providers = fresh ? [] : await listLoginProviders();
  const ssoError = ssoErrorMessage((await searchParams).sso_error);

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
        {ssoError && (
          <p role="alert" className="mb-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-500">
            {ssoError}
          </p>
        )}
        <LoginForm mode={fresh ? "setup" : "login"} />
        {providers.length > 0 && (
          <div className="mt-6">
            <div className="mb-4 flex items-center gap-3 text-xs text-ink-muted">
              <span className="h-px flex-1 bg-line" />
              or
              <span className="h-px flex-1 bg-line" />
            </div>
            <div className="space-y-2">
              {providers.map((p) => (
                <a
                  key={p.id}
                  href={`/api/auth/sso/${p.id}/start`}
                  className="btn-ghost w-full justify-center"
                >
                  Sign in with {p.label}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
