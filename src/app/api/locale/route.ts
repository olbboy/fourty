import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { json, apiError } from "@/lib/api";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n";

/**
 * Set the interface locale (Gate C4). A UI preference cookie for the signed-in
 * user — it touches no tenant data and maps to no RBAC object, so it authenticates
 * (getSessionUser) but is exempt from the authorize() static guard.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  let body: { locale?: unknown };
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON body");
  }
  if (!isLocale(typeof body.locale === "string" ? body.locale : null)) {
    return apiError("Unsupported locale");
  }
  const jar = await cookies();
  jar.set(LOCALE_COOKIE, body.locale as string, {
    httpOnly: false, // read by the client for optimistic UI; not sensitive
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return json({ ok: true, locale: body.locale });
}
