-- Row-Level Security + application-role grants (ADR-001).
-- The app connects as the non-owner role `fourty_app`, so these policies confine
-- every query to the workspace in current_setting('app.workspace_id'). FORCE RLS
-- makes the policies apply even to the table owner (defense in depth). When the
-- GUC is unset, current_setting(...) is NULL and every predicate is false — the
-- app sees zero rows and inserts fail (fail closed).

-- Grants: fourty_app gets DML but never ownership.
GRANT USAGE ON SCHEMA public TO fourty_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fourty_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fourty_app;--> statement-breakpoint

-- Tenant isolation policies on every workspace-scoped data table.
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "companies_tenant" ON "companies" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));--> statement-breakpoint

ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contacts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "contacts_tenant" ON "contacts" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));--> statement-breakpoint

ALTER TABLE "pipelines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pipelines" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "pipelines_tenant" ON "pipelines" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));--> statement-breakpoint

ALTER TABLE "stages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "stages_tenant" ON "stages" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));--> statement-breakpoint

ALTER TABLE "deals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "deals" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "deals_tenant" ON "deals" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));--> statement-breakpoint

ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tasks_tenant" ON "tasks" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));--> statement-breakpoint

ALTER TABLE "notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "notes_tenant" ON "notes" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));--> statement-breakpoint

ALTER TABLE "activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activities" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "activities_tenant" ON "activities" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));--> statement-breakpoint

ALTER TABLE "custom_field_defs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "custom_field_defs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "custom_field_defs_tenant" ON "custom_field_defs" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));--> statement-breakpoint

ALTER TABLE "workflows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workflows" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "workflows_tenant" ON "workflows" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));--> statement-breakpoint

ALTER TABLE "workflow_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workflow_runs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "workflow_runs_tenant" ON "workflow_runs" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));--> statement-breakpoint

ALTER TABLE "saved_views" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "saved_views" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "saved_views_tenant" ON "saved_views" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));
