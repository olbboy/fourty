/**
 * Seed the database with a default pipeline and rich demo data.
 * Run: npm run db:seed  (idempotent — skips if data already exists)
 * The default pipeline is also created automatically on first boot.
 */
import { eq } from "drizzle-orm";
import { db, tables } from "./index";
import { newId } from "@/lib/id";
import { logActivity } from "@/lib/activity";
import { recomputeContactScore } from "@/lib/services/contact-score";

export const DEFAULT_STAGES = [
  { name: "Lead", winProbability: 10, type: "open", color: "#94a3b8" },
  { name: "Qualified", winProbability: 25, type: "open", color: "#60a5fa" },
  { name: "Demo", winProbability: 45, type: "open", color: "#a78bfa" },
  { name: "Proposal", winProbability: 65, type: "open", color: "#fbbf24" },
  { name: "Negotiation", winProbability: 85, type: "open", color: "#fb923c" },
  { name: "Won", winProbability: 100, type: "won", color: "#34d399" },
  { name: "Lost", winProbability: 0, type: "lost", color: "#f87171" },
] as const;

/** Create the default sales pipeline if none exists. Returns pipeline id. */
export async function ensureDefaultPipeline(): Promise<string> {
  const existing = (await db.select().from(tables.pipelines).limit(1))[0];
  if (existing) return existing.id;
  const pipelineId = newId();
  const now = Date.now();
  await db
    .insert(tables.pipelines)
    .values({ id: pipelineId, name: "Sales Pipeline", isDefault: 1, createdAt: now });
  for (let i = 0; i < DEFAULT_STAGES.length; i++) {
    const s = DEFAULT_STAGES[i];
    await db.insert(tables.stages).values({
      id: newId(),
      pipelineId,
      name: s.name,
      order: i,
      winProbability: s.winProbability,
      type: s.type,
      color: s.color,
    });
  }
  return pipelineId;
}

function daysAgo(n: number): number {
  return Date.now() - n * 86400000;
}

function daysAhead(n: number): number {
  return Date.now() + n * 86400000;
}

export async function seedDemoData(): Promise<void> {
  if ((await db.select().from(tables.companies).limit(1))[0]) {
    console.log("Data already present — skipping seed.");
    return;
  }
  const pipelineId = await ensureDefaultPipeline();
  const stages = await db.select().from(tables.stages);
  const stageByName = new Map(stages.map((s) => [s.name, s]));

  // Owner = the first existing user. seedDemoData runs inside a workspace
  // context (RLS); both callers (setup route, db:seed CLI) create the user +
  // workspace before invoking it.
  const owner = (await db.select().from(tables.users).limit(1))[0];
  if (!owner) throw new Error("seedDemoData: no user exists — create one first");
  const ownerId = owner.id;

  const companySpecs = [
    { name: "Acme Robotics", domain: "acmerobotics.io", industry: "Manufacturing", size: "201-500", city: "Detroit", country: "USA", annualRevenue: 42000000 },
    { name: "Northwind Cloud", domain: "northwind.cloud", industry: "SaaS", size: "51-200", city: "Seattle", country: "USA", annualRevenue: 12500000 },
    { name: "Lotus Fintech", domain: "lotusfin.vn", industry: "Fintech", size: "11-50", city: "Ho Chi Minh City", country: "Vietnam", annualRevenue: 3800000 },
    { name: "Helios Energy", domain: "heliosenergy.de", industry: "Energy", size: "501-1000", city: "Munich", country: "Germany", annualRevenue: 98000000 },
    { name: "Kite Media", domain: "kitemedia.co", industry: "Media", size: "1-10", city: "London", country: "UK", annualRevenue: 900000 },
    { name: "Sakura Logistics", domain: "sakura-log.jp", industry: "Logistics", size: "201-500", city: "Osaka", country: "Japan", annualRevenue: 56000000 },
  ];
  const companyIds: string[] = [];
  for (const c of companySpecs) {
    const id = newId();
    companyIds.push(id);
    const created = daysAgo(30 + Math.floor(Math.random() * 90));
    await db
      .insert(tables.companies)
      .values({ id, ...c, website: `https://${c.domain}`, ownerId, createdAt: created, updatedAt: created });
    await logActivity({ type: "created", entityType: "company", entityId: id, actorId: ownerId });
  }

  const contactSpecs = [
    { firstName: "Maya", lastName: "Chen", email: "maya.chen@acmerobotics.io", phone: "+1 313 555 0111", jobTitle: "VP Engineering", companyIdx: 0, status: "qualified", source: "referral", linkedin: "in/mayachen" },
    { firstName: "Jonas", lastName: "Weber", email: "j.weber@heliosenergy.de", phone: "+49 89 555 0122", jobTitle: "Head of Procurement", companyIdx: 3, status: "customer", source: "event", linkedin: "in/jonasweber" },
    { firstName: "Linh", lastName: "Tran", email: "linh.tran@lotusfin.vn", phone: "+84 28 5550 133", jobTitle: "CTO", companyIdx: 2, status: "qualified", source: "website", linkedin: "in/linhtran" },
    { firstName: "Sofia", lastName: "Almeida", email: "sofia@northwind.cloud", jobTitle: "Growth Lead", companyIdx: 1, status: "lead", source: "website" },
    { firstName: "Ken", lastName: "Watanabe", email: "k.watanabe@sakura-log.jp", phone: "+81 6 555 0144", jobTitle: "Operations Director", companyIdx: 5, status: "lead", source: "outbound" },
    { firstName: "Priya", lastName: "Nair", email: "priya@kitemedia.co", jobTitle: "Founder", companyIdx: 4, status: "customer", source: "referral", linkedin: "in/priyanair" },
    { firstName: "Tom", lastName: "Berg", email: "tom.berg@northwind.cloud", phone: "+1 206 555 0155", jobTitle: "CFO", companyIdx: 1, status: "qualified", source: "event" },
    { firstName: "Ana", lastName: "Silva", jobTitle: "Sales Manager", companyIdx: null, status: "lead", source: "other" },
  ];
  const contactIds: string[] = [];
  for (const c of contactSpecs) {
    const id = newId();
    contactIds.push(id);
    const created = daysAgo(10 + Math.floor(Math.random() * 80));
    await db.insert(tables.contacts).values({
      id,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email ?? null,
      phone: c.phone ?? null,
      jobTitle: c.jobTitle ?? null,
      companyId: c.companyIdx === null ? null : companyIds[c.companyIdx],
      ownerId,
      status: c.status,
      source: c.source,
      linkedin: c.linkedin ?? null,
      createdAt: created,
      updatedAt: created,
    });
    await logActivity({ type: "created", entityType: "contact", entityId: id, actorId: ownerId });
  }

  // Sprinkle engagement activities so scores/dashboards look real
  const engagements: [number, string, number][] = [
    [0, "call", 2], [0, "email", 5], [0, "meeting", 1],
    [1, "email", 3], [1, "meeting", 12],
    [2, "call", 1], [2, "email", 2], [2, "meeting", 6],
    [3, "email", 20],
    [5, "call", 4], [5, "email", 8],
    [6, "meeting", 3], [6, "email", 9],
  ];
  for (const [idx, type, days] of engagements) {
    await db.insert(tables.activities).values({
      id: newId(),
      type,
      entityType: "contact",
      entityId: contactIds[idx],
      actorId: ownerId,
      meta: "{}",
      createdAt: daysAgo(days),
    });
  }

  const dealSpecs = [
    { name: "Acme — Assembly line retrofit", amount: 145000, currency: "USD", stage: "Negotiation", companyIdx: 0, contactIdx: 0, closeIn: 12 },
    { name: "Helios — Enterprise rollout", amount: 320000, currency: "EUR", stage: "Won", companyIdx: 3, contactIdx: 1, closeIn: -20 },
    { name: "Lotus — Core banking pilot", amount: 900000000, currency: "VND", stage: "Demo", companyIdx: 2, contactIdx: 2, closeIn: 30 },
    { name: "Northwind — Annual platform", amount: 48000, currency: "USD", stage: "Proposal", companyIdx: 1, contactIdx: 6, closeIn: 21 },
    { name: "Kite — Starter plan", amount: 6000, currency: "GBP", stage: "Won", companyIdx: 4, contactIdx: 5, closeIn: -45 },
    { name: "Sakura — Fleet tracking", amount: 8400000, currency: "JPY", stage: "Qualified", companyIdx: 5, contactIdx: 4, closeIn: 45 },
    { name: "Northwind — Expansion seats", amount: 22000, currency: "USD", stage: "Lead", companyIdx: 1, contactIdx: 3, closeIn: 60 },
    { name: "Acme — Support contract", amount: 30000, currency: "USD", stage: "Lost", companyIdx: 0, contactIdx: 0, closeIn: -10 },
  ];
  for (const d of dealSpecs) {
    const stage = stageByName.get(d.stage)!;
    const id = newId();
    const created = daysAgo(20 + Math.floor(Math.random() * 60));
    const closed = stage.type !== "open" ? daysAgo(Math.abs(d.closeIn)) : null;
    await db.insert(tables.deals).values({
      id,
      name: d.name,
      amount: d.amount,
      currency: d.currency,
      pipelineId,
      stageId: stage.id,
      companyId: companyIds[d.companyIdx],
      contactId: contactIds[d.contactIdx],
      ownerId,
      expectedCloseDate: d.closeIn > 0 ? daysAhead(d.closeIn) : daysAgo(-d.closeIn),
      closedAt: closed,
      stageEnteredAt: daysAgo(Math.floor(Math.random() * 15)),
      createdAt: created,
      updatedAt: created,
    });
    await logActivity({ type: "created", entityType: "deal", entityId: id, actorId: ownerId });
  }

  const taskSpecs = [
    { title: "Send revised proposal to Maya", priority: "high", dueIn: 1, entityIdx: 0 },
    { title: "Schedule demo with Lotus team", priority: "high", dueIn: 3, entityIdx: 2 },
    { title: "Follow up on expansion seats", priority: "medium", dueIn: 7, entityIdx: 3 },
    { title: "Quarterly check-in with Helios", priority: "low", dueIn: 14, entityIdx: 1 },
    { title: "Reconnect with Ken about pilot", priority: "medium", dueIn: -2, entityIdx: 4 },
  ];
  for (const t of taskSpecs) {
    await db.insert(tables.tasks).values({
      id: newId(),
      title: t.title,
      priority: t.priority,
      dueDate: t.dueIn >= 0 ? daysAhead(t.dueIn) : daysAgo(-t.dueIn),
      ownerId,
      entityType: "contact",
      entityId: contactIds[t.entityIdx],
      createdAt: daysAgo(5),
    });
  }

  // Example workflows that showcase the engine
  await db.insert(tables.workflows).values({
    id: newId(),
    name: "Follow up on new leads within 2 days",
    enabled: 1,
    trigger: JSON.stringify({ event: "contact.created" }),
    conditions: JSON.stringify([{ field: "status", op: "eq", value: "lead" }]),
    actions: JSON.stringify([
      { type: "create_task", title: "Follow up with {{firstName}} {{lastName}}", priority: "high", dueInDays: 2 },
    ]),
    createdAt: Date.now(),
  });
  await db.insert(tables.workflows).values({
    id: newId(),
    name: "Celebrate won deals",
    enabled: 1,
    trigger: JSON.stringify({ event: "deal.won" }),
    conditions: JSON.stringify([]),
    actions: JSON.stringify([
      { type: "add_note", body: "🎉 Deal won: {{name}} — kick off onboarding." },
      { type: "create_task", title: "Kick off onboarding for {{name}}", priority: "high", dueInDays: 3 },
    ]),
    createdAt: Date.now(),
  });

  for (const id of contactIds) await recomputeContactScore(id);
  console.log(
    `Seeded ${companyIds.length} companies, ${contactIds.length} contacts, ${dealSpecs.length} deals, ${taskSpecs.length} tasks, 2 workflows.`,
  );
}

const invokedDirectly = process.argv[1]?.endsWith("seed.ts");
if (invokedDirectly) {
  (async () => {
    const { withWorkspace } = await import("./index");
    const { createUser, createWorkspace, membershipsOf } = await import("@/lib/auth");
    let user = (await db.select().from(tables.users).limit(1))[0];
    if (!user) {
      const id = await createUser("demo@fourty.dev", "Demo User", "demo1234", "admin");
      user = (await db.select().from(tables.users).where(eq(tables.users.id, id)).limit(1))[0]!;
      console.log("Created demo user: demo@fourty.dev / demo1234");
    }
    const memberships = await membershipsOf(user.id);
    const workspaceId = memberships[0]?.workspaceId ?? (await createWorkspace("Demo Workspace", user.id));
    await withWorkspace(workspaceId, () => seedDemoData());
    process.exit(0);
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
