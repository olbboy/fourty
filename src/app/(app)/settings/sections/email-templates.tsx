"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui";
import { TEMPLATE_BLANKS } from "@/lib/email-template";
import { useT } from "@/lib/i18n/provider";

type Template = { id: string; name: string; subject: string; body: string };

/** Email templates (D15): members keep them; anyone writing an email can use them. */
export function EmailTemplatesSection({ canEdit }: { canEdit: boolean }) {
  const t = useT();
  const [askConfirm, confirmDialog] = useConfirm();
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/email-templates").catch(() => null);
    if (res?.ok) setTemplates(((await res.json()) as { templates: Template[] }).templates);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function send(url: string, method: string, body?: unknown): Promise<boolean> {
    setError(null);
    const res = await fetch(url, { method, headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }).catch(() => null);
    if (!res?.ok) {
      setError(t("templates.failed"));
      return false;
    }
    await load();
    return true;
  }

  if (!templates) return null;
  return (
    <Card size="flush" className="p-4">
      <h2 className="text-sm font-semibold">{t("templates.title")}</h2>
      <p className="mb-3 text-sm text-ink-muted">{t("templates.hint", { blanks: TEMPLATE_BLANKS.map((b) => `{{${b}}}`).join(", ") })}</p>
      {templates.length === 0 ? (
        <p className="mb-3 text-sm text-ink-muted">{t("templates.empty")}</p>
      ) : (
        <ul className="mb-3 divide-y divide-line/60">
          {templates.map((tpl) =>
            editing === tpl.id ? (
              <li key={tpl.id} className="py-2.5">
                <TemplateForm
                  initial={tpl}
                  submitLabel={t("action.save")}
                  onCancel={() => setEditing(null)}
                  onSubmit={async (values) => {
                    if (await send(`/api/email-templates/${tpl.id}`, "PATCH", values)) setEditing(null);
                  }}
                />
              </li>
            ) : (
              <li key={tpl.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{tpl.name}</p>
                  <p className="truncate text-xs text-ink-muted">{tpl.subject}</p>
                </div>
                {canEdit && (
                  <>
                    <Button size="sm" variant="outline" aria-label={t("templates.editAria", { name: tpl.name })} onClick={() => setEditing(tpl.id)}>
                      {t("action.edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-feedback-error"
                      aria-label={t("templates.deleteAria", { name: tpl.name })}
                      onClick={async () => {
                        const ok = await askConfirm({ title: t("templates.deleteTitle", { name: tpl.name }), body: t("templates.deleteBody") });
                        if (ok) await send(`/api/email-templates/${tpl.id}`, "DELETE");
                      }}
                    >
                      {t("action.delete")}
                    </Button>
                  </>
                )}
              </li>
            ),
          )}
        </ul>
      )}
      {canEdit && editing === null && (
        <TemplateForm submitLabel={t("templates.add")} reset onSubmit={async (values) => void (await send("/api/email-templates", "POST", values))} />
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-feedback-error">
          {error}
        </p>
      )}
      {confirmDialog}
    </Card>
  );
}

type Values = { name: string; subject: string; body: string };

function TemplateForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  reset,
}: {
  initial?: Template;
  submitLabel: string;
  onSubmit: (values: Values) => Promise<void>;
  onCancel?: () => void;
  reset?: boolean;
}) {
  const t = useT();
  const [name, setName] = useState(initial?.name ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [busy, setBusy] = useState(false);
  const ready = name.trim() && subject.trim() && body.trim();
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        await onSubmit({ name: name.trim(), subject: subject.trim(), body: body.trim() });
        setBusy(false);
        if (reset) {
          setName("");
          setSubject("");
          setBody("");
        }
      }}
    >
      <div className="flex flex-wrap gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} aria-label={t("templates.name")} placeholder={t("templates.name")} maxLength={120} className="h-8 w-48" />
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} aria-label={t("templates.subject")} placeholder={t("templates.subject")} maxLength={200} className="h-8 min-w-0 flex-1" />
      </div>
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} aria-label={t("templates.body")} placeholder={t("templates.body")} rows={4} maxLength={20_000} />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            {t("action.cancel")}
          </Button>
        )}
        <Button type="submit" size="sm" disabled={!ready || busy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
