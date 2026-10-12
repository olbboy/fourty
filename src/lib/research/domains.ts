/**
 * Domains that say nothing about an employer. Pure data, shared by the
 * signature extractor (which must not read a Twitter link as a company website)
 * and the mail pass (which must not call a gmail.com address a contradiction of
 * a company domain).
 */

/** A personal mailbox. Its domain is not where the person works. */
export const FREE_MAIL_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.co.uk",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "zoho.com",
  "mail.com",
  "yandex.com",
  "qq.com",
  "163.com",
];

/** A profile or a tool, not the employer's website. */
export const SOCIAL_DOMAINS = [
  "linkedin.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "instagram.com",
  "github.com",
  "gitlab.com",
  "youtube.com",
  "medium.com",
  "calendly.com",
  "zoom.us",
  "teams.microsoft.com",
  "bit.ly",
];

export function isFreeMailDomain(domain: string): boolean {
  return FREE_MAIL_DOMAINS.includes(domain.toLowerCase());
}
