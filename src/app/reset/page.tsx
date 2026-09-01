import { Logo } from "@/components/logo";
import { ResetForm } from "./reset-form";
import { LocaleProvider } from "@/lib/i18n/provider";
import { translator } from "@/lib/i18n";
import { requestLocale } from "@/lib/i18n/request-locale";

export const dynamic = "force-dynamic";

/**
 * Choose a new password with an emailed token. The token arrives in the query
 * string, straight from the reset email; whether it is still good is decided
 * by the API on submit — checking it here too would just produce a second,
 * subtly different expiry message to keep in sync.
 */
export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token?.trim();
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
            <p className="text-sm text-ink-muted">
              {token ? t("auth.choosePassword") : t("auth.incompleteLink")}
            </p>
          </div>
          {token ? (
            <ResetForm token={token} />
          ) : (
            <p
              role="alert"
              className="rounded-lg bg-feedback-error-wash px-4 py-3 text-sm text-feedback-error"
            >
              {t("auth.missingToken")}{" "}
              <a href="/forgot" className="underline underline-offset-2">
                {t("auth.requestNew")}
              </a>
              .
            </p>
          )}
        </div>
      </main>
    </LocaleProvider>
  );
}
