-- Down for 0028 — remove Targets.
DROP POLICY IF EXISTS "targets_tenant" ON "targets";--> statement-breakpoint
ALTER TABLE "targets" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "targets" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE IF EXISTS "targets" CASCADE;
