/**
 * Filling an Email template (CONTEXT.md). Pure: the blanks are {{name}} with
 * optional spaces; a known name takes its value (empty when there is none on
 * this record), and an unknown one stays as typed so the writer sees it.
 */

/** The blanks a template may use, in the order Settings lists them. */
export const TEMPLATE_BLANKS = ["contact.firstName", "contact.lastName", "company.name", "deal.name", "sender.name"] as const;
export type TemplateBlank = (typeof TEMPLATE_BLANKS)[number];

export function renderTemplate(text: string, values: Partial<Record<TemplateBlank, string>>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (whole, name: string) =>
    (TEMPLATE_BLANKS as readonly string[]).includes(name) ? (values[name as TemplateBlank] ?? "") : whole,
  );
}
