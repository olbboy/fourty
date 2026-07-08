-- Down for 0007 — remove email + calendar sync tables.
DROP POLICY IF EXISTS "calendar_events_tenant" ON "calendar_events";--> statement-breakpoint
ALTER TABLE "calendar_events" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "calendar_events" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "email_messages_tenant" ON "email_messages";--> statement-breakpoint
ALTER TABLE "email_messages" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "email_messages" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "sync_accounts_tenant" ON "sync_accounts";--> statement-breakpoint
ALTER TABLE "sync_accounts" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sync_accounts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE IF EXISTS "calendar_events" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "email_messages" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "sync_accounts" CASCADE;
