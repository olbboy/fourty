import { redirect } from "next/navigation";
import { getSessionUser, isFreshInstall } from "@/lib/auth";
import { mailEnabled } from "@/lib/mail";
import { listLoginProviders } from "@/lib/sso/provision";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";
import { buttonVariants } from "@/components/ui/button";
import { cn, safeInternalPath } from "@/lib/utils";
import { LocaleProvider } from "@/lib/i18n/provider";
import { translator, type MessageKey } from "@/lib/i18n";
import { requestLocale } from "@/lib/i18n/request-locale";

export const dynamic = "force-dynamic";

const SSO_ERRORS: Record<string, MessageKey> = {
  unknown_or_disabled_provider: "login.sso.unknown",
  provider_discovery_failed: "login.sso.discovery",
  missing_code_or_state: "login.sso.missing",
  invalid_or_expired_state: "login.sso.expired",
  sso_login_failed: "login.sso.failed",
};

function ssoErrorMessage(
  code: string | undefined,
  t: (key: MessageKey) => string,
): string | null {
  if (!code) return null;
  if (SSO_ERRORS[code]) return t(SSO_ERRORS[code]);
  if (code.startsWith("provider_error:")) return t("login.sso.providerError");
  return t("login.sso.failedRetry");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sso_error?: string; next?: string }>;
}) {
  const params = await searchParams;
  // Where to land after signing in — an invite's "sign in first" hand-off sets
  // it. Validated to an internal path so the login page can't be pointed at an
  // attacker's site by a crafted link.
  const next = safeInternalPath(params.next);
  const user = await getSessionUser();
  if (user) redirect(next ?? "/dashboard");
  const fresh = await isFreshInstall();
  // SSO is offered only for returning installs (a fresh install has no workspace
  // to JIT-provision users into yet).
  const providers = fresh ? [] : await listLoginProviders();
  const locale = await requestLocale();
  const t = translator(locale);
  const ssoError = ssoErrorMessage(params.sso_error, t);

  return (
    <LocaleProvider locale={locale}>
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
                {fresh ? t("login.welcome") : t("login.signInTo")}
              </p>
            </div>
          </div>
          {ssoError && (
            <p role="alert" className="mb-4 rounded-lg bg-feedback-error-wash px-4 py-3 text-sm text-feedback-error">
              {ssoError}
            </p>
          )}
          <LoginForm mode={fresh ? "setup" : "login"} next={next} />
          {!fresh && mailEnabled() && (
            <p className="mt-4 text-center text-sm text-ink-muted">
              <a href="/forgot" className="underline underline-offset-2">
                {t("login.forgot")}
              </a>
            </p>
          )}
          {providers.length > 0 && (
            <div className="mt-6">
              <div className="mb-4 flex items-center gap-3 text-xs text-ink-muted">
                <span className="h-px flex-1 bg-line" />
                {t("login.or")}
                <span className="h-px flex-1 bg-line" />
              </div>
              <div className="space-y-2">
                {providers.map((p) => (
                  <a
                    key={p.id}
                    href={`/api/auth/sso/${p.id}/start`}
                    className={cn(buttonVariants({ variant: "outline" }), "w-full")}
                  >
                    {t("login.signInWith", { name: p.label })}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </LocaleProvider>
  );
}
