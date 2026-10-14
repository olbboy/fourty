import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { logActivity } from "@/lib/activity";
import { displayName } from "@/lib/format";
import { canReadField, loadFieldPolicy } from "@/lib/field-permissions";
import { mailEnabled } from "@/lib/mail";
import { enqueue } from "@/lib/queue";
import { rateLimit } from "@/lib/ratelimit";
import { recomputeContactScore } from "@/lib/services/contact-score";
import { register } from "../registry";
import { defineAction } from "../define";
import { ActionError } from "../types";

/** Per sender: a working day of real emails fits easily; a runaway script does not. */
export const EMAILS_PER_HOUR = 30;

/** What was sent, for the caller and the audit entry. */
type SentEmail = { contactId: string; subject: string; entityType: "contact" | "deal"; entityId: string };

/**
 * Email a contact from the CRM (D6). The mail leaves through this server's
 * mail service under the member's name, and replies go to the member's own
 * address. The recipient must be on the record it is written from: the contact
 * itself, or someone on the deal. The email lands on the contact's timeline,
 * and on the deal's when written from one.
 *
 * Sent through the mail queue like every other message, so no provider
 * round-trip sits inside the request's transaction (ADR-015) and a mail
 * service that is briefly down gets retried.
 */
export const emailSend = defineAction({
  name: "email.send",
  object: "activities",
  verb: "create",
  description:
    "Send an email to a contact (from their page) or to someone on a deal (from the deal), under the signed-in member's name with replies to their address.",
  input: z.object({
    entityType: z.enum(["contact", "deal"]),
    entityId: z.string().min(1),
    contactId: z.string().min(1),
    // One line: a subject is a mail header, and a line break would end it.
    subject: z.string().trim().min(1).max(200).regex(/^[^\r\n]*$/, "one line"),
    body: z.string().trim().min(1).max(20_000),
  }),
  expose: { rest: true },
  run: async (input, ctx): Promise<SentEmail> => {
    // Replies go to a person, so a key with no one behind it cannot write.
    if (!ctx.userId) throw new ActionError("forbidden", "Sending email needs a signed-in member: replies go to their address");
    const sender = (await db.select().from(tables.users).where(eq(tables.users.id, ctx.userId)).limit(1))[0];
    if (!sender) throw new ActionError("forbidden", "Sending email needs a signed-in member");

    await assertOnRecord(input.entityType, input.entityId, input.contactId);
    const contact = (await db.select().from(tables.contacts).where(eq(tables.contacts.id, input.contactId)).limit(1))[0]!;
    // Someone barred from seeing a contact's email cannot write to it either.
    if (!canReadField(await loadFieldPolicy(ctx.role), "contacts", "email")) {
      throw new ActionError("forbidden", "Forbidden: cannot read contacts field(s): email");
    }
    if (!contact.email) throw new ActionError("invalid", "contactId: this contact has no email address");

    if (!mailEnabled()) throw new ActionError("unavailable", "Mail is not configured on this server");
    const budget = rateLimit(`email.send:${ctx.userId}`, { limit: EMAILS_PER_HOUR, windowMs: 3_600_000 });
    if (!budget.allowed) {
      throw new ActionError("rate_limited", `Too many emails: try again in ${Math.ceil(budget.retryAfter / 60)} min`);
    }

    // The timeline names the contact rather than repeating the address: a role
    // barred from contacts' emails still reads timelines.
    const toName = displayName(contact.firstName, contact.lastName);
    const meta = { sent: true, subject: input.subject, contactId: contact.id, toName, body: input.body };
    await logActivity({ type: "email", entityType: "contact", entityId: contact.id, actorId: ctx.userId, meta });
    if (input.entityType === "deal") {
      await logActivity({ type: "email", entityType: "deal", entityId: input.entityId, actorId: ctx.userId, meta });
    }
    // Last, after every write that could still fail: the queue commits on its own.
    await enqueue(
      "mail.send",
      { to: contact.email, subject: input.subject, text: input.body, replyTo: sender.email, fromName: sender.name },
      { workspaceId: ctx.workspaceId },
    );
    return { contactId: contact.id, subject: input.subject, entityType: input.entityType, entityId: input.entityId };
  },
  effects: {
    audit: (_i, out) => ({ key: "email.sent", objectType: out.entityType, objectId: out.entityId, meta: { contactId: out.contactId } }),
    rescore: async (_i, out) => {
      await recomputeContactScore(out.contactId);
    },
  },
});

/** The contact must be the record itself, or on the deal (primary or a Deal contact). */
async function assertOnRecord(entityType: "contact" | "deal", entityId: string, contactId: string): Promise<void> {
  const exists = (await db.select({ id: tables.contacts.id }).from(tables.contacts).where(eq(tables.contacts.id, contactId)).limit(1))[0];
  if (entityType === "contact") {
    if (contactId !== entityId) throw new ActionError("invalid", "contactId: write to this contact from their own page");
    if (!exists) throw new ActionError("not_found", "Contact not found");
    return;
  }
  const deal = (await db.select({ contactId: tables.deals.contactId }).from(tables.deals).where(eq(tables.deals.id, entityId)).limit(1))[0];
  if (!deal) throw new ActionError("not_found", "Deal not found");
  const onDeal =
    deal.contactId === contactId ||
    (
      await db
        .select({ id: tables.dealContacts.id })
        .from(tables.dealContacts)
        .where(and(eq(tables.dealContacts.dealId, entityId), eq(tables.dealContacts.contactId, contactId)))
        .limit(1)
    ).length > 0;
  if (!exists || !onDeal) throw new ActionError("invalid", "contactId: not someone on this deal");
}

register(emailSend);
