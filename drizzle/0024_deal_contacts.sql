-- 0024 — Deal contacts: the people in a deal besides its primary contact.
--
-- deals.contact_id stays the primary contact; this table adds the others with
-- the role each plays (technical, purchasing, decision maker). One row per
-- deal and contact. Workspace-scoped with RLS like every tenant table.
CREATE TABLE "deal_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL,
	"deal_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"role" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "deal_contacts_pair_idx" ON "deal_contacts" ("workspace_id","deal_id","contact_id");--> statement-breakpoint
CREATE INDEX "deal_contacts_contact_idx" ON "deal_contacts" ("workspace_id","contact_id");--> statement-breakpoint
ALTER TABLE "deal_contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "deal_contacts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "deal_contacts_tenant" ON "deal_contacts" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));
