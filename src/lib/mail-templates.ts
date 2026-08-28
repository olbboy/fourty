import type { MailMessage } from "@/lib/mail";

/**
 * Rendered bodies for the transactional mail Fourty sends.
 *
 * Kept apart from src/lib/mail.ts (the SMTP transport) so copy can be read and
 * tested without a mail server, and so the queue payload is a finished message
 * rather than a template plus arguments the worker would have to re-resolve.
 */

/** Escape for interpolation into the HTML part. Names and workspace titles are
 *  user-controlled, and an unescaped `<` there would break the markup — or
 *  smuggle a second, attacker-written link into an email Fourty vouches for. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type InviteEmailInput = {
  workspaceName: string;
  /** Display name of the admin who sent it; omitted for API-key invites. */
  inviterName?: string | null;
  role: string;
  acceptUrl: string;
  expiresAt: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function inviteEmail(input: InviteEmailInput): Omit<MailMessage, "to"> {
  const { workspaceName, inviterName, role, acceptUrl, expiresAt } = input;
  const days = Math.max(1, Math.round((expiresAt - Date.now()) / DAY_MS));
  const who = inviterName ? `${inviterName} invited you` : "You've been invited";
  const subject = `${who} to ${workspaceName} on Fourty`;

  const text = [
    `${who} to join ${workspaceName} on Fourty as ${role}.`,
    "",
    "Open this link to accept:",
    acceptUrl,
    "",
    `The link works once and expires in ${days} day${days === 1 ? "" : "s"}.`,
    "If you weren't expecting this, you can ignore this email.",
  ].join("\n");

  // Deliberately plain markup: table-free, no images, no web fonts, no external
  // stylesheet. Mail clients strip most CSS, and anything they do keep has to
  // survive dark mode, so the link is a plain <a> rather than a styled button.
  const html = [
    `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55">`,
    `<p>${escapeHtml(who)} to join <strong>${escapeHtml(workspaceName)}</strong> on Fourty as ${escapeHtml(role)}.</p>`,
    `<p><a href="${escapeHtml(acceptUrl)}">Accept the invite</a></p>`,
    `<p style="color:#666;font-size:13px">The link works once and expires in ${days} day${days === 1 ? "" : "s"}. `,
    `If you weren't expecting this, you can ignore this email.</p>`,
    `</div>`,
  ].join("");

  return { subject, text, html };
}
