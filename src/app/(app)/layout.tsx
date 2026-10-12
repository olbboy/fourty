import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AppShell } from "@/components/shell";
import { isAiEnabled } from "@/lib/ai/provider";
import { requestLocale } from "@/lib/i18n/request-locale";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const [jar, locale] = await Promise.all([cookies(), requestLocale()]);
  // shadcn's Sidebar persists its collapsed state in this cookie; reading it here
  // means the server renders the rail in the state the user left it.
  const defaultSidebarOpen = jar.get("sidebar_state")?.value !== "false";
  return (
    <AppShell
      user={{ name: user.name, email: user.email }}
      locale={locale}
      aiEnabled={isAiEnabled()}
      defaultSidebarOpen={defaultSidebarOpen}
    >
      {children}
    </AppShell>
  );
}
