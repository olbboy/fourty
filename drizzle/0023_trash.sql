-- 0023 — the Trash: a deleted record waits here for 30 days.
--
-- A deleted contact, company, deal or task is copied here with its notes, its
-- timeline and what it was detached from (payload, JSON), then removed from its
-- own table as before. Keeping deleted rows in their own table rather than a
-- deleted_at column means no list, report, search or export can forget to
-- filter them out. Workspace-scoped with RLS like every tenant table.
CREATE TABLE "trash" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"label" text NOT NULL,
	"payload" text NOT NULL,
	"deleted_by" text,
	"deleted_at" bigint NOT NULL
);--> statement-breakpoint
CREATE INDEX "trash_ws_deleted_idx" ON "trash" ("workspace_id","deleted_at");--> statement-breakpoint
ALTER TABLE "trash" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "trash" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "trash_tenant" ON "trash" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));
