import { z } from "zod";
import { desc, eq, like, sql } from "drizzle-orm";
import { db, tables } from "@/db";
import { newId } from "@/lib/id";
import { displayName } from "@/lib/format";
import { linesOf, sumLines, type DealLine } from "@/lib/deal-lines";
import { canReadField, loadFieldPolicy } from "@/lib/field-permissions";
import { localDay } from "@/lib/reminders";
import { loadReminderSettings } from "@/lib/services/reminders";
import { defineAction } from "./define";
import { register } from "./registry";
import { ActionError, type ActionContext } from "./types";

/** What a quote copies in when it is made (CONTEXT.md: Quote). */
type QuoteSnapshot = {
  deal: string;
  buyer: { company: string | null; contact: string | null; email: string | null };
  seller: { workspace: string; by: string | null; email: string | null };
  lines: Omit<DealLine, "id">[];
};

export type QuoteSummary = { id: string; dealId: string; number: string; issuedAt: number; validUntil: number; currency: string; total: number };
export type Quote = QuoteSummary & QuoteSnapshot & { terms: string | null };

type Row = typeof tables.quotes.$inferSelect;
const summary = (r: Row): QuoteSummary => ({
  id: r.id,
  dealId: r.dealId,
  number: r.number,
  issuedAt: r.issuedAt,
  validUntil: r.validUntil,
  currency: r.currency,
  total: r.total,
});
const toQuote = (r: Row): Quote => ({ ...summary(r), ...(JSON.parse(r.snapshot) as QuoteSnapshot), terms: r.terms });

/** A quote is the Amount in parts: a role that cannot read a deal's amount sees no quote. */
async function requireAmount(ctx: ActionContext): Promise<void> {
  if (!canReadField(await loadFieldPolicy(ctx.role), "deals", "amount")) {
    throw new ActionError("forbidden", "Forbidden: cannot read deals field(s): amount");
  }
}

const DAY = 86_400_000;

/**
 * Make a quote from a deal's line items (D16). Numbered BG-<year>-<n> per
 * workspace, the year of the workspace's own calendar; the workspace lock
 * makes two quotes made at once take turns for the next number.
 */
export const quotesCreate = defineAction({
  name: "quotes.create",
  object: "deals",
  verb: "update",
  description: "Make a quote from a deal's line items, valid for validDays (default 30), with optional terms.",
  input: z.object({
    id: z.string().min(1),
    validDays: z.number().int().min(1).max(365).optional(),
    terms: z.string().trim().max(4000).optional(),
  }),
  expose: { rest: true },
  run: async ({ id, validDays = 30, terms }, ctx): Promise<Quote> => {
    await requireAmount(ctx);
    const deal = (await db.select().from(tables.deals).where(eq(tables.deals.id, id)).limit(1))[0];
    if (!deal) throw new ActionError("not_found", "Deal not found");
    const lines = await linesOf(id);
    if (!lines.length) throw new ActionError("invalid", "A quote is made from line items: add line items to the deal first");

    const contact = deal.contactId ? (await db.select().from(tables.contacts).where(eq(tables.contacts.id, deal.contactId)).limit(1))[0] : undefined;
    const company = deal.companyId ? (await db.select().from(tables.companies).where(eq(tables.companies.id, deal.companyId)).limit(1))[0] : undefined;
    const workspace = (await db.select({ name: tables.workspaces.name }).from(tables.workspaces).where(eq(tables.workspaces.id, ctx.workspaceId)).limit(1))[0];
    const by = ctx.userId ? (await db.select().from(tables.users).where(eq(tables.users.id, ctx.userId)).limit(1))[0] : undefined;

    const now = Date.now();
    const year = localDay(now, (await loadReminderSettings()).timeZone).slice(0, 4);
    await db.execute(sql`select pg_advisory_xact_lock(hashtext(current_setting('app.workspace_id', true) || ':quotes'))`);
    const prefix = `BG-${year}-`;
    const last = (
      await db.select({ number: tables.quotes.number }).from(tables.quotes).where(like(tables.quotes.number, `${prefix}%`)).orderBy(desc(tables.quotes.number)).limit(1)
    )[0];
    const number = `${prefix}${String((last ? Number(last.number.slice(prefix.length)) : 0) + 1).padStart(4, "0")}`;

    const snapshot: QuoteSnapshot = {
      deal: deal.name,
      buyer: {
        company: company?.name ?? null,
        contact: contact ? displayName(contact.firstName, contact.lastName) : null,
        email: contact?.email ?? null,
      },
      seller: { workspace: workspace?.name ?? "", by: by?.name ?? null, email: by?.email ?? null },
      lines: lines.map(({ id: _id, ...line }) => line),
    };
    const quoteId = newId();
    await db.insert(tables.quotes).values({
      id: quoteId,
      dealId: id,
      number,
      issuedAt: now,
      validUntil: now + validDays * DAY,
      currency: deal.currency,
      total: sumLines(lines) ?? 0,
      snapshot: JSON.stringify(snapshot),
      terms: terms || null,
      createdBy: ctx.userId,
      createdAt: now,
    });
    return toQuote((await db.select().from(tables.quotes).where(eq(tables.quotes.id, quoteId)).limit(1))[0]!);
  },
  effects: {
    activity: (_i, out, ctx) => ({
      type: "quote",
      entityType: "deal",
      entityId: out.dealId,
      actorId: ctx.userId,
      meta: { number: out.number, total: out.total, currency: out.currency, quoteId: out.id },
    }),
    audit: (_i, out) => ({ key: "quote.created", objectType: "deal", objectId: out.dealId, meta: { number: out.number } }),
  },
});

export const quotesList = defineAction({
  name: "quotes.list",
  object: "deals",
  verb: "read",
  description: "The quotes made for a deal, newest first.",
  input: z.object({ id: z.string().min(1) }),
  expose: { rest: true },
  run: async ({ id }, ctx): Promise<QuoteSummary[]> => {
    await requireAmount(ctx);
    return (await db.select().from(tables.quotes).where(eq(tables.quotes.dealId, id)).orderBy(desc(tables.quotes.issuedAt))).map(summary);
  },
});

export const quotesGet = defineAction({
  name: "quotes.get",
  object: "deals",
  verb: "read",
  description: "One quote as it was made.",
  input: z.object({ id: z.string().min(1) }),
  expose: { rest: true },
  run: async ({ id }, ctx): Promise<Quote> => {
    await requireAmount(ctx);
    const row = (await db.select().from(tables.quotes).where(eq(tables.quotes.id, id)).limit(1))[0];
    if (!row) throw new ActionError("not_found", "Quote not found");
    return toQuote(row);
  },
});

register(quotesCreate);
register(quotesList);
register(quotesGet);
