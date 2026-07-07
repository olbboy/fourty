-- Reverse 0001_workspaces: drop workspace_id columns (drops their composite
-- indexes), restore the original single-column indexes, drop the tenancy tables.
ALTER TABLE "activities" DROP COLUMN IF EXISTS "workspace_id";--> statement-breakpoint
ALTER TABLE "api_keys" DROP COLUMN IF EXISTS "workspace_id";--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "workspace_id";--> statement-breakpoint
ALTER TABLE "contacts" DROP COLUMN IF EXISTS "workspace_id";--> statement-breakpoint
ALTER TABLE "custom_field_defs" DROP COLUMN IF EXISTS "workspace_id";--> statement-breakpoint
ALTER TABLE "deals" DROP COLUMN IF EXISTS "workspace_id";--> statement-breakpoint
ALTER TABLE "notes" DROP COLUMN IF EXISTS "workspace_id";--> statement-breakpoint
ALTER TABLE "pipelines" DROP COLUMN IF EXISTS "workspace_id";--> statement-breakpoint
ALTER TABLE "saved_views" DROP COLUMN IF EXISTS "workspace_id";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "workspace_id";--> statement-breakpoint
ALTER TABLE "stages" DROP COLUMN IF EXISTS "workspace_id";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "workspace_id";--> statement-breakpoint
ALTER TABLE "workflow_runs" DROP COLUMN IF EXISTS "workspace_id";--> statement-breakpoint
ALTER TABLE "workflows" DROP COLUMN IF EXISTS "workspace_id";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activities_entity_idx" ON "activities" ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activities_created_idx" ON "activities" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "companies_name_idx" ON "companies" ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_email_idx" ON "contacts" ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_company_idx" ON "contacts" ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deals_stage_idx" ON "deals" ("stage_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deals_pipeline_idx" ON "deals" ("pipeline_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notes_entity_idx" ON "notes" ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stages_pipeline_idx" ON "stages" ("pipeline_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_entity_idx" ON "tasks" ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_runs_wf_idx" ON "workflow_runs" ("workflow_id");--> statement-breakpoint
DROP TABLE IF EXISTS "workspace_members";--> statement-breakpoint
DROP TABLE IF EXISTS "workspaces";
