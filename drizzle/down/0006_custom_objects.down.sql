-- Down for 0006 — remove custom objects (definitions, fields, records).
DROP POLICY IF EXISTS "custom_records_tenant" ON "custom_records";--> statement-breakpoint
ALTER TABLE "custom_records" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "custom_records" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "custom_object_fields_tenant" ON "custom_object_fields";--> statement-breakpoint
ALTER TABLE "custom_object_fields" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "custom_object_fields" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "custom_objects_tenant" ON "custom_objects";--> statement-breakpoint
ALTER TABLE "custom_objects" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "custom_objects" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE IF EXISTS "custom_records" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "custom_object_fields" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "custom_objects" CASCADE;
