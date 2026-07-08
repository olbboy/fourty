import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AppShell } from "@/components/shell";
import { LOCALE_COOKIE, resolveLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const [jar, hdrs] = await Promise.all([cookies(), headers()]);
  const locale = resolveLocale({
    cookie: jar.get(LOCALE_COOKIE)?.value,
    acceptLanguage: hdrs.get("accept-language"),
  });
  return (
    <AppShell user={{ name: user.name, email: user.email }} locale={locale}>
      {children}
    </AppShell>
  );
}
