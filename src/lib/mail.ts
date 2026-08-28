import { log } from "@/lib/logger";

/**
 * Outbound transactional email over SMTP.
 *
 * OFF BY DEFAULT — the same dormant-until-env idiom as the generative layer
 * (src/lib/ai/index.ts) and OAuth mail sync (src/lib/sync/oauth.ts): with no
 * SMTP_* configured, `mailerFromEnv()` returns null and every caller falls back
 * to whatever it did before mail existed. Self-hosters who don't want Fourty
 * touching an SMTP server simply leave it unset.
 *
 * Plain SMTP rather than a provider SDK: the operator already has a mailbox
 * (Lark, Google Workspace, Fastmail, a local Postfix), so an account and a
 * password is the whole setup — no new vendor, no API key, and no change to the
 * domain's SPF/DKIM, since mail leaves through the same server that already
 * sends for the domain.
 */

export type MailMessage = {
  to: string;
  subject: string;
  /** Plain-text body. Always sent — some clients never render the HTML part. */
  text: string;
  html?: string;
};

export type Mailer = {
  /** Host mail leaves through, for logs and the diagnostics panel. */
  host: string;
  from: string;
  send(msg: MailMessage): Promise<void>;
};

// Test seam, mirroring __setAiClient: `undefined` = not overridden, `null` =
// force "mail disabled", a mailer = force-enabled with a capturing fake.
let override: Mailer | null | undefined;
export function __setMailer(mailer: Mailer | null | undefined): void {
  override = mailer;
}

/** True when an SMTP server is configured. */
export function mailEnabled(): boolean {
  return mailerFromEnv() !== null;
}

/**
 * Resolve a mailer from the environment, or null when SMTP is unconfigured.
 * Never throws here — a bad host surfaces at send() time, where it can be
 * retried, rather than at import time, where it would take a page down.
 */
export function mailerFromEnv(): Mailer | null {
  if (override !== undefined) return override;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  // All three or nothing: a half-filled config is a deployment mistake, and
  // silently sending unauthenticated would be worse than staying off.
  if (!host || !user || !pass) return null;

  const port = Number(process.env.SMTP_PORT ?? 465);
  // Implicit TLS on 465, STARTTLS on 587/25. Overridable for the rare server
  // that disagrees with its own port number.
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "1" : port === 465;
  const from = process.env.MAIL_FROM ?? user;

  return {
    host,
    from,
    send: (msg) => smtpSend({ host, port, secure, user, pass, from }, msg),
  };
}

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

// One pooled transport per process. Re-creating it per message would open a new
// TCP+TLS connection for every send, which providers rate-limit as abuse.
const globalForMail = globalThis as unknown as {
  __fourtyMailTransport?: { key: string; transport: import("nodemailer").Transporter };
};

async function smtpSend(cfg: SmtpConfig, msg: MailMessage): Promise<void> {
  const key = `${cfg.host}:${cfg.port}:${cfg.secure}:${cfg.user}`;
  let cached = globalForMail.__fourtyMailTransport;

  if (!cached || cached.key !== key) {
    // Imported lazily so the SMTP client stays out of any bundle that never
    // sends mail (and out of the graph entirely when SMTP is unconfigured).
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
      pool: true,
      maxConnections: 2,
    });
    cached = { key, transport };
    globalForMail.__fourtyMailTransport = cached;
  }

  await cached.transport.sendMail({
    from: cfg.from,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
  });
  // Recipient is logged; the body is not — invite mail carries a live token.
  log().info({ to: msg.to, host: cfg.host }, "mail sent");
}
