CREATE TABLE "workspace_members" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
DROP INDEX "activities_entity_idx";--> statement-breakpoint
DROP INDEX "activities_created_idx";--> statement-breakpoint
DROP INDEX "companies_name_idx";--> statement-breakpoint
DROP INDEX "contacts_email_idx";--> statement-breakpoint
DROP INDEX "contacts_company_idx";--> statement-breakpoint
DROP INDEX "deals_stage_idx";--> statement-breakpoint
DROP INDEX "deals_pipeline_idx";--> statement-breakpoint
DROP INDEX "notes_entity_idx";--> statement-breakpoint
DROP INDEX "stages_pipeline_idx";--> statement-breakpoint
DROP INDEX "tasks_entity_idx";--> statement-breakpoint
DROP INDEX "workflow_runs_wf_idx";--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_field_defs" ADD COLUMN "workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL;--> statement-breakpoint
ALTER TABLE "pipelines" ADD COLUMN "workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_views" ADD COLUMN "workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "stages" ADD COLUMN "workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL;--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL;--> statement-breakpoint
CREATE INDEX "workspace_members_ws_idx" ON "workspace_members" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_members_user_idx" ON "workspace_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_members_unique" ON "workspace_members" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "activities_ws_entity_idx" ON "activities" USING btree ("workspace_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "activities_ws_created_idx" ON "activities" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "companies_ws_name_idx" ON "companies" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "contacts_ws_email_idx" ON "contacts" USING btree ("workspace_id","email");--> statement-breakpoint
CREATE INDEX "contacts_ws_company_idx" ON "contacts" USING btree ("workspace_id","company_id");--> statement-breakpoint
CREATE INDEX "deals_ws_stage_idx" ON "deals" USING btree ("workspace_id","stage_id");--> statement-breakpoint
CREATE INDEX "deals_ws_pipeline_idx" ON "deals" USING btree ("workspace_id","pipeline_id");--> statement-breakpoint
CREATE INDEX "notes_ws_entity_idx" ON "notes" USING btree ("workspace_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "stages_ws_pipeline_idx" ON "stages" USING btree ("workspace_id","pipeline_id");--> statement-breakpoint
CREATE INDEX "tasks_ws_entity_idx" ON "tasks" USING btree ("workspace_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_ws_wf_idx" ON "workflow_runs" USING btree ("workspace_id","workflow_id");