-- Down for 0004 — remove audit immutability + tenant RLS on the B3 tables.
DROP RULE IF EXISTS "audit_log_no_update" ON "audit_log";--> statement-breakpoint
DROP RULE IF EXISTS "audit_log_no_delete" ON "audit_log";--> statement-breakpoint
GRANT UPDATE, DELETE ON "audit_log" TO fourty_app;--> statement-breakpoint
DROP POLICY IF EXISTS "audit_log_tenant" ON "audit_log";--> statement-breakpoint
ALTER TABLE "audit_log" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_log" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "settings_tenant" ON "settings";--> statement-breakpoint
ALTER TABLE "settings" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "settings" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "invites_tenant" ON "invites";--> statement-breakpoint
ALTER TABLE "invites" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invites" DISABLE ROW LEVEL SECURITY;
