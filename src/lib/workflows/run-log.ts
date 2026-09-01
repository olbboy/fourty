import type { MessageKey } from "@/lib/i18n";

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * Engine run logs are stable English machine records (tests + stored JSON).
 * Map known lines to catalog keys at display time; leave custom `log` actions
 * and unknown lines as written.
 */
export function formatRunLogLine(line: string, t: Translate): string {
  const created = /^created task "(.*)"$/.exec(line);
  if (created) return t("wf.run.createdTask", { title: created[1] });
  if (line === "skipped note: tasks have no notes") return t("wf.run.skippedNote");
  if (line === "added note") return t("wf.run.addedNote");
  if (line === "skipped update_field: unsupported entity") return t("wf.run.skippedUpdateEntity");
  const skippedField = /^skipped update_field: field "(.*)" not allowed$/.exec(line);
  if (skippedField) return t("wf.run.skippedUpdateField", { field: skippedField[1] });
  const setField = /^set (\S+) = (.*)$/.exec(line);
  if (setField) return t("wf.run.setField", { field: setField[1], value: setField[2] });
  const webhook = /^webhook queued → (.*)$/.exec(line);
  if (webhook) return t("wf.run.webhookQueued", { url: webhook[1] });
  if (line === "skipped ai_draft: tasks have no notes") return t("wf.run.skippedAiTask");
  if (line === "skipped ai_draft: AI disabled (set FOURTY_ENABLE_AI=1)") return t("wf.run.skippedAiDisabled");
  if (line === "ai draft queued") return t("wf.run.aiQueued");
  if (line === "unknown action") return t("wf.run.unknownAction");
  const err = /^error: (.*)$/.exec(line);
  if (err) return t("wf.run.error", { message: err[1] });
  return line;
}
