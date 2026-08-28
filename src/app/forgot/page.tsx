import { mailEnabled } from "@/lib/mail";
import { Logo } from "@/components/logo";
import { ForgotForm } from "./forgot-form";

export const dynamic = "force-dynamic";

/**
 * Request a password-reset email. Outside the (app) group like /login and
 * /accept — the visitor cannot sign in, which is the point.
 *
 * When no mail transport is configured the form would accept requests that can
 * never arrive, so the page says so instead and points at the operator; the
 * API would silently no-op anyway, this is just the honest version.
 */
export default function ForgotPage() {
  const enabled = mailEnabled();

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <h1>
            <Logo variant="full" height={34} title="Fourty" />
          </h1>
          <p className="text-sm text-ink-muted">Reset your password</p>
        </div>
        {enabled ? (
          <ForgotForm />
        ) : (
          <p className="rounded-lg bg-feedback-warn-wash px-4 py-3 text-sm text-feedback-warn">
            Password reset by email isn&apos;t set up on this instance. Ask your administrator to
            reset your password from the server.
          </p>
        )}
      </div>
    </main>
  );
}
