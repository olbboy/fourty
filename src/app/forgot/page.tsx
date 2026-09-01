import { mailEnabled } from "@/lib/mail";
import { Logo } from "@/components/logo";
import { ForgotForm } from "./forgot-form";
import { LocaleProvider } from "@/lib/i18n/provider";
import { translator } from "@/lib/i18n";
import { requestLocale } from "@/lib/i18n/request-locale";

export const dynamic = "force-dynamic";

/**
 * Request a password-reset email. Outside the (app) group like /login and
 * /accept — the visitor cannot sign in, which is the point.
 *
 * When no mail transport is configured the form would accept requests that can
 * never arrive, so the page says so instead and points at the operator; the
 * API would silently no-op anyway, this is just the honest version.
 */
export default async function ForgotPage() {
  const enabled = mailEnabled();
  const locale = await requestLocale();
  const t = translator(locale);

  return (
    <LocaleProvider locale={locale}>
      <main className="flex min-h-dvh items-center justify-center p-4">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            <h1>
              <Logo variant="full" height={34} title="Fourty" />
            </h1>
            <p className="text-sm text-ink-muted">{t("auth.resetTitle")}</p>
          </div>
          {enabled ? (
            <ForgotForm />
          ) : (
            <p className="rounded-lg bg-feedback-warn-wash px-4 py-3 text-sm text-feedback-warn">
              {t("auth.resetNoMail")}
            </p>
          )}
        </div>
      </main>
    </LocaleProvider>
  );
}
