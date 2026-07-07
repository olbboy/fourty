-- Reverse 0002_rls: drop policies, disable RLS, revoke grants.
DROP POLICY IF EXISTS "companies_tenant" ON "companies";--> statement-breakpoint
ALTER TABLE "companies" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "companies" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "contacts_tenant" ON "contacts";--> statement-breakpoint
ALTER TABLE "contacts" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contacts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "pipelines_tenant" ON "pipelines";--> statement-breakpoint
ALTER TABLE "pipelines" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pipelines" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "stages_tenant" ON "stages";--> statement-breakpoint
ALTER TABLE "stages" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stages" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "deals_tenant" ON "deals";--> statement-breakpoint
ALTER TABLE "deals" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "deals" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tasks_tenant" ON "tasks";--> statement-breakpoint
ALTER TABLE "tasks" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasks" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "notes_tenant" ON "notes";--> statement-breakpoint
ALTER TABLE "notes" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notes" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "activities_tenant" ON "activities";--> statement-breakpoint
ALTER TABLE "activities" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activities" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "custom_field_defs_tenant" ON "custom_field_defs";--> statement-breakpoint
ALTER TABLE "custom_field_defs" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "custom_field_defs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "workflows_tenant" ON "workflows";--> statement-breakpoint
ALTER TABLE "workflows" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workflows" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "workflow_runs_tenant" ON "workflow_runs";--> statement-breakpoint
ALTER TABLE "workflow_runs" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workflow_runs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "saved_views_tenant" ON "saved_views";--> statement-breakpoint
ALTER TABLE "saved_views" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "saved_views" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM fourty_app;
