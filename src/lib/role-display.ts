import type { MessageKey } from "@/lib/i18n";

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** Role is a stable English machine token (API + DB); map it at display time. */
export function roleLabel(role: string, t: Translate): string {
  if (role === "admin") return t("settings.roleAdmin");
  if (role === "member") return t("settings.roleMember");
  if (role === "viewer") return t("settings.roleViewer");
  return role;
}
