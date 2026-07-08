-- 0008 — field-level permissions (Gate D1, ADR-011).
-- Per (object, field, role) rule restricting read/write of a core-object field.
-- No rule = allowed (backward compatible); admin is never restricted. Workspace-
-- scoped + RLS; fourty_app inherits DML from the ALTER DEFAULT PRIVILEGES in 0002.
CREATE TABLE "field_permissions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL,
	"object" text NOT NULL,
	"field" text NOT NULL,
	"role" text NOT NULL,
	"can_read" integer DEFAULT 1 NOT NULL,
	"can_write" integer DEFAULT 1 NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "field_permissions_unique_idx" ON "field_permissions" ("workspace_id","object","field","role");--> statement-breakpoint
ALTER TABLE "field_permissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "field_permissions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "field_permissions_tenant" ON "field_permissions" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));
