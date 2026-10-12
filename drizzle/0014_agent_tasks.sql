-- 0014 — agent work ledger (Phase 2 of the agentic upgrade).
-- One row per unit of background work: what it is about, why (in words a human
-- reads), when it is due, which lane drains it, and what came of it. pg-boss
-- remains the transport; this is the intent, and it is joinable to a record.
--
-- Workspace-scoped + RLS. The claim query is an UPDATE over a
-- FOR UPDATE SKIP LOCKED sub-select and runs as fourty_app inside
-- withWorkspace(), so the tenant policy applies to both halves — that is the
-- single highest-risk line in the phase and has its own test.
CREATE TABLE "agent_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"kind" text NOT NULL,
	"reason" text NOT NULL,
	"lane" text DEFAULT 'direct' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"budget" integer DEFAULT 3 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"due_at" bigint NOT NULL,
	"leased_until" bigint,
	"started_at" bigint,
	"finished_at" bigint,
	"outcome" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
-- The claim query's index: what is due, unleased, in this workspace.
CREATE INDEX "agent_tasks_due_idx" ON "agent_tasks" ("workspace_id","due_at","leased_until");--> statement-breakpoint
-- "What is queued about this record, and why" — the record page's question.
CREATE INDEX "agent_tasks_entity_idx" ON "agent_tasks" ("workspace_id","entity_type","entity_id");--> statement-breakpoint
ALTER TABLE "agent_tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_tasks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "agent_tasks_tenant" ON "agent_tasks" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));
