"use client";

import { useState } from "react";
import { Modal } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { IconMail } from "@/components/icons";
import { useT } from "@/lib/i18n/provider";

export type Recipient = { contactId: string; name: string; email: string | null };

/**
 * Write an email from a contact's or a deal's page (D6). It leaves through
 * this server's mail service under the member's name and replies reach the
 * member's own mailbox; the server writes it on the timeline. When the server
 * has no mail set up, the dialog says so instead of offering a dead form.
 */
export function EmailCompose({
  entityType,
  entityId,
  mailReady,
  loadRecipients,
  onSent,
}: {
  entityType: "contact" | "deal";
  entityId: string;
  mailReady: boolean;
  /** Who can be written to from this record: the contact itself, or the people on the deal. */
  loadRecipients: () => Promise<Recipient[]>;
  onSent?: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);

  async function start() {
    setError(null);
    setOpen(true);
    const list = await loadRecipients().catch(() => []);
    const reachable = list.filter((r) => r.email);
    setRecipients(reachable);
    setTo((current) => (reachable.some((r) => r.contactId === current) ? current : (reachable[0]?.contactId ?? "")));
    const res = await fetch("/api/email-templates").catch(() => null);
    if (res?.ok) setTemplates(((await res.json()) as { templates: { id: string; name: string }[] }).templates);
  }

  /** Fill subject and message from a template, for the contact chosen; still editable. */
  async function applyTemplate(templateId: string) {
    if (!templateId || !to) return;
    const res = await fetch(`/api/email-templates/${templateId}/render`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entityType, entityId, contactId: to }),
    }).catch(() => null);
    if (!res?.ok) return;
    const filled = (await res.json()) as { subject: string; body: string };
    setSubject(filled.subject);
    setBody(filled.body);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!to || !subject.trim() || !body.trim() || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entityType, entityId, contactId: to, subject, body }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      setOpen(false);
      setSubject("");
      setBody("");
      onSent?.();
      return;
    }
    if (res?.status === 503) setError(t("email.notConfigured"));
    else if (res?.status === 429) setError(t("email.tooMany"));
    else setError(t("email.failed"));
  }

  return (
    <>
      <Button variant="outline" onClick={() => void start()}>
        <IconMail width={15} height={15} /> {t("email.compose")}
      </Button>
      <Modal title={t("email.title")} open={open} onClose={() => setOpen(false)} wide>
        {!mailReady ? (
          <p role="status" className="text-sm text-ink-muted">
            {t("email.notConfigured")}
          </p>
        ) : recipients.length === 0 ? (
          <p role="status" className="text-sm text-ink-muted">
            {t("email.noRecipient")}
          </p>
        ) : (
          <form className="space-y-3" onSubmit={send}>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("email.to")}</span>
              <NativeSelect value={to} onChange={(e) => setTo(e.target.value)} className="w-full" aria-label={t("email.to")}>
                {recipients.map((r) => (
                  <option key={r.contactId} value={r.contactId}>
                    {r.name} &lt;{r.email}&gt;
                  </option>
                ))}
              </NativeSelect>
            </label>
            {templates.length > 0 && (
              <NativeSelect value="" onChange={(e) => void applyTemplate(e.target.value)} aria-label={t("email.useTemplateAria")} className="w-full">
                <option value="">{t("email.useTemplate")}</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </NativeSelect>
            )}
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} aria-label={t("email.subject")} placeholder={t("email.subject")} maxLength={200} />
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              aria-label={t("email.body")}
              placeholder={t("email.body")}
              rows={8}
              maxLength={20_000}
            />
            <p className="text-xs text-ink-muted">{t("email.replyHint")}</p>
            {error && (
              <p role="alert" className="text-sm text-feedback-error">
                {error}
              </p>
            )}
            <div className="flex justify-end">
              <Button type="submit" disabled={busy || !to || !subject.trim() || !body.trim()}>
                {t("email.send")}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
