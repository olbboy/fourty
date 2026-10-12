import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Validate a ?next= redirect target as an internal path, or return null.
 *
 * Anything that fails is dropped rather than repaired: a login page that
 * forwards wherever its query string points is an open redirect, and the
 * classic escapes are absolute URLs ("https://evil.test"), protocol-relative
 * ones ("//evil.test"), and backslash variants ("/\\evil.test" — browsers
 * normalise the backslash to a slash, turning it protocol-relative).
 */
export function safeInternalPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  return raw;
}
