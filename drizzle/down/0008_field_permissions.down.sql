-- Down for 0008 — remove field-level permissions.
DROP POLICY IF EXISTS "field_permissions_tenant" ON "field_permissions";--> statement-breakpoint
ALTER TABLE "field_permissions" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "field_permissions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE IF EXISTS "field_permissions" CASCADE;
