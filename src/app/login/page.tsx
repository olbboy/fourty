import { redirect } from "next/navigation";
import { getSessionUser, isFreshInstall } from "@/lib/auth";
import { mailEnabled } from "@/lib/mail";
import { listLoginProviders } from "@/lib/sso/provision";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
          {/* The lockup carries the name, so the heading is the artwork rather
              than "Fourty" set in a font beside it. */}
          <h1>
            <Logo variant="full" height={34} title="Fourty" />
          </h1>
          <div>
            <p className="text-sm text-ink-muted">
              {fresh
                ? "Welcome! Create your admin account to get started."
                : "Sign in to your workspace"}
            </p>
          </div>
        </div>
        {ssoError && (
          <p role="alert" className="mb-4 rounded-lg bg-feedback-error-wash px-4 py-3 text-sm text-feedback-error">
            {ssoError}
          </p>
        )}
        <LoginForm mode={fresh ? "setup" : "login"} />
        {!fresh && mailEnabled() && (
          <p className="mt-4 text-center text-sm text-ink-muted">
            <a href="/forgot" className="underline underline-offset-2">
              Forgot your password?
            </a>
          </p>
        )}
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
                  className={cn(buttonVariants({ variant: "outline" }), "w-full")}
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
