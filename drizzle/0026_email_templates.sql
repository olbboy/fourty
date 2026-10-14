-- 0026 — Email templates (D15).
--
-- A workspace's reusable subject and body; blanks such as {{contact.firstName}}
-- are filled from the contact, deal and sender when an email is written.
-- Workspace-scoped with RLS like every tenant table.
CREATE TABLE "email_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"created_by" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);--> statement-breakpoint
CREATE INDEX "email_templates_ws_name_idx" ON "email_templates" ("workspace_id","name");--> statement-breakpoint
ALTER TABLE "email_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "email_templates" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "email_templates_tenant" ON "email_templates" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));
