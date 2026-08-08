-- 0013 — evidence ledger (ADR-018).
-- One row per observed claim about a field of a record: the observations as
-- given, the score a pure function derived from them, the band that score puts
-- them in, and what happened to the claim. Polymorphic entity_type/entity_id,
-- the same shape tasks/notes/activities already use.
--
-- Workspace-scoped + RLS; fourty_app inherits DML from the ALTER DEFAULT
-- PRIVILEGES in 0002. Nothing here is append-only: a fact legitimately moves
-- PROPOSED → APPLIED → SUPERSEDED, and a reversal is a status change plus a new
-- audit row. The audit log stays the immutable record (0004).
CREATE TABLE "record_facts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"field" text NOT NULL,
	"value" text NOT NULL,
	"previous_value" text,
	"score" double precision NOT NULL,
	"band" text NOT NULL,
	"evidence" text DEFAULT '[]' NOT NULL,
	"method" text DEFAULT 'research' NOT NULL,
	"source_url" text,
	"status" text DEFAULT 'PROPOSED' NOT NULL,
	"decided_by" text,
	"decided_at" bigint,
	"observed_at" bigint NOT NULL,
	"superseded_at" bigint
);
--> statement-breakpoint
-- "what does this pass think about this field" — the write path's every lookup.
CREATE INDEX "record_facts_target_idx" ON "record_facts" ("workspace_id","entity_type","entity_id","field","status");--> statement-breakpoint
-- "what is waiting for a human" — the suggestion inbox, newest first.
CREATE INDEX "record_facts_inbox_idx" ON "record_facts" ("workspace_id","status","observed_at");--> statement-breakpoint
ALTER TABLE "record_facts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "record_facts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "record_facts_tenant" ON "record_facts" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));
