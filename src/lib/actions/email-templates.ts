import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { newId } from "@/lib/id";
import { renderTemplate, type TemplateBlank } from "@/lib/email-template";
import { canReadField, loadFieldPolicy } from "@/lib/field-permissions";
import { defineAction } from "./define";
import { register } from "./registry";
import { ActionError } from "./types";

/** An Email template as surfaces return it. */
export type EmailTemplate = { id: string; name: string; subject: string; body: string; createdBy: string | null; updatedAt: number };

type Row = typeof tables.emailTemplates.$inferSelect;
const toTemplate = (r: Row): EmailTemplate => ({ id: r.id, name: r.name, subject: r.subject, body: r.body, createdBy: r.createdBy, updatedAt: r.updatedAt });
const templateInput = z.object({
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20_000),
});

async function templateOrThrow(id: string): Promise<Row> {
  const row = (await db.select().from(tables.emailTemplates).where(eq(tables.emailTemplates.id, id)).limit(1))[0];
  if (!row) throw new ActionError("not_found", "Template not found");
  return row;
}

export const emailTemplatesList = defineAction({
  name: "emailTemplates.list",
  object: "email-templates",
  verb: "read",
  description: "List the workspace's email templates by name.",
  input: z.object({}),
  expose: { rest: true },
  run: async (): Promise<EmailTemplate[]> =>
    (await db.select().from(tables.emailTemplates).orderBy(asc(tables.emailTemplates.name))).map(toTemplate),
});

export const emailTemplatesCreate = defineAction({
  name: "emailTemplates.create",
  object: "email-templates",
  verb: "create",
  description: "Add an email template: a name, a subject and a body with {{blanks}}.",
  input: templateInput,
  expose: { rest: true },
  run: async (input, ctx): Promise<EmailTemplate> => {
    const id = newId();
    const now = Date.now();
    await db.insert(tables.emailTemplates).values({ id, ...input, createdBy: ctx.userId, createdAt: now, updatedAt: now });
    return toTemplate(await templateOrThrow(id));
  },
  effects: { audit: (_i, out) => ({ key: "email_template.created", objectType: "email_template", objectId: out.id }) },
});

export const emailTemplatesUpdate = defineAction({
  name: "emailTemplates.update",
  object: "email-templates",
  verb: "update",
  description: "Change an email template.",
  input: templateInput.partial().extend({ id: z.string().min(1) }),
  expose: { rest: true },
  run: async ({ id, ...patch }): Promise<EmailTemplate> => {
    await templateOrThrow(id);
    await db.update(tables.emailTemplates).set({ ...patch, updatedAt: Date.now() }).where(eq(tables.emailTemplates.id, id));
    return toTemplate(await templateOrThrow(id));
  },
  effects: { audit: (_i, out) => ({ key: "email_template.updated", objectType: "email_template", objectId: out.id }) },
});

export const emailTemplatesDelete = defineAction({
  name: "emailTemplates.delete",
  object: "email-templates",
  verb: "delete",
  description: "Remove an email template.",
  input: z.object({ id: z.string().min(1) }),
  expose: { rest: true },
  run: async ({ id }): Promise<{ deleted: true; id: string }> => {
    await templateOrThrow(id);
    await db.delete(tables.emailTemplates).where(eq(tables.emailTemplates.id, id));
    return { deleted: true, id };
  },
  effects: { audit: (_i, out) => ({ key: "email_template.deleted", objectType: "email_template", objectId: out.id }) },
});

/**
 * A template filled for one contact, from a contact's page or a deal's: the
 * contact's names, the company (the deal's, else the contact's), the deal's
 * name and the sender's. Reading, so a viewer may preview it too.
 */
export const emailTemplatesRender = defineAction({
  name: "emailTemplates.render",
  object: "email-templates",
  verb: "read",
  description: "Fill an email template for a contact, from the contact or a deal.",
  input: z.object({ id: z.string().min(1), entityType: z.enum(["contact", "deal"]), entityId: z.string().min(1), contactId: z.string().min(1) }),
  expose: { rest: true },
  run: async ({ id, entityType, entityId, contactId }, ctx): Promise<{ subject: string; body: string }> => {
    const template = await templateOrThrow(id);
    const contact = (await db.select().from(tables.contacts).where(eq(tables.contacts.id, contactId)).limit(1))[0];
    if (!contact) throw new ActionError("not_found", "Contact not found");
    const deal =
      entityType === "deal" ? (await db.select().from(tables.deals).where(eq(tables.deals.id, entityId)).limit(1))[0] : undefined;
    if (entityType === "deal" && !deal) throw new ActionError("not_found", "Deal not found");
    const companyId = deal?.companyId ?? contact.companyId;
    const company = companyId ? (await db.select().from(tables.companies).where(eq(tables.companies.id, companyId)).limit(1))[0] : undefined;
    const sender = ctx.userId ? (await db.select({ name: tables.users.name }).from(tables.users).where(eq(tables.users.id, ctx.userId)).limit(1))[0] : undefined;
    // A field the reader may not see fills its blank with nothing.
    const policy = await loadFieldPolicy(ctx.role);
    const seen = (object: string, field: string, value: string | null | undefined) => (canReadField(policy, object, field) ? (value ?? "") : "");
    const values: Partial<Record<TemplateBlank, string>> = {
      "contact.firstName": seen("contacts", "firstName", contact.firstName),
      "contact.lastName": seen("contacts", "lastName", contact.lastName),
      "company.name": seen("companies", "name", company?.name),
      "deal.name": seen("deals", "name", deal?.name),
      "sender.name": sender?.name ?? "",
    };
    return { subject: renderTemplate(template.subject, values), body: renderTemplate(template.body, values) };
  },
});

register(emailTemplatesList);
register(emailTemplatesCreate);
register(emailTemplatesUpdate);
register(emailTemplatesDelete);
register(emailTemplatesRender);
