import { getSessionUser } from "@/lib/auth";
import { Logo } from "@/components/logo";
import { AcceptForm } from "./accept-form";
import { LocaleProvider } from "@/lib/i18n/provider";
import { translator } from "@/lib/i18n";
import { requestLocale } from "@/lib/i18n/request-locale";

export const dynamic = "force-dynamic";

/**
 * Redeem a workspace invite. Deliberately outside the (app) group: the visitor
 * is not a member yet, so there is no workspace chrome to render and no session
 * to require. The token arrives in the query string, straight from the invite
 * email.
 */
export default async function AcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token?.trim();
  // A signed-in visitor joins as themselves; anyone else fills in a name and a
  // password and the token authorizes the signup.
  const user = await getSessionUser();
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
              {token ? t("accept.invited") : t("accept.incomplete")}
            </p>
          </div>
          {token ? (
            <AcceptForm token={token} signedInAs={user?.email ?? null} />
          ) : (
            <p
              role="alert"
              className="rounded-lg bg-feedback-error-wash px-4 py-3 text-sm text-feedback-error"
            >
              {t("accept.missingToken")}
            </p>
          )}
        </div>
      </main>
    </LocaleProvider>
  );
}
