-- 0006 — custom objects (no-code, Gate C1, ADR-007).
-- A workspace defines its own object types without DDL: custom_objects holds the
-- definition, custom_object_fields the field schema, custom_records one row per
-- record with its values in a JSON `data` column. All three are workspace-scoped
-- + RLS like every other tenant table; fourty_app inherits DML from the ALTER
-- DEFAULT PRIVILEGES in 0002.
CREATE TABLE "custom_objects" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL,
	"api_name" text NOT NULL,
	"name_singular" text NOT NULL,
	"name_plural" text NOT NULL,
	"icon" text DEFAULT 'Box' NOT NULL,
	"description" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "custom_objects_ws_apiname_idx" ON "custom_objects" ("workspace_id","api_name");--> statement-breakpoint
CREATE TABLE "custom_object_fields" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL,
	"object_id" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" text DEFAULT 'text' NOT NULL,
	"options" text DEFAULT '[]' NOT NULL,
	"required" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "custom_object_fields_ws_object_idx" ON "custom_object_fields" ("workspace_id","object_id");--> statement-breakpoint
CREATE TABLE "custom_records" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL,
	"object_id" text NOT NULL,
	"data" text DEFAULT '{}' NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "custom_records_ws_object_idx" ON "custom_records" ("workspace_id","object_id","updated_at");--> statement-breakpoint
ALTER TABLE "custom_objects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "custom_objects" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "custom_objects_tenant" ON "custom_objects" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));--> statement-breakpoint
ALTER TABLE "custom_object_fields" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "custom_object_fields" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "custom_object_fields_tenant" ON "custom_object_fields" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));--> statement-breakpoint
ALTER TABLE "custom_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "custom_records" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "custom_records_tenant" ON "custom_records" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));
