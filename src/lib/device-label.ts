/**
 * "Chrome · macOS" from a user agent, for the list of signed-in devices. Only
 * the common browsers and systems are named; anything else shows its first
 * word, so an unusual client is still recognisable rather than hidden.
 */
export function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return "";
  // Order matters: Edge and Chrome both say "Chrome", Chrome also says "Safari".
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : null;
  const system = /iPhone/.test(userAgent)
    ? "iPhone"
    : /iPad/.test(userAgent)
      ? "iPad"
      : /Android/.test(userAgent)
        ? "Android"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(userAgent)
            ? "macOS"
            : /Linux/.test(userAgent)
              ? "Linux"
              : null;
  if (!browser && !system) return userAgent.split(" ")[0];
  return [browser, system].filter(Boolean).join(" · ");
}
