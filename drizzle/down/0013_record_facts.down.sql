-- Down for 0013 — remove the evidence ledger.
DROP POLICY IF EXISTS "record_facts_tenant" ON "record_facts";--> statement-breakpoint
ALTER TABLE "record_facts" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "record_facts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE IF EXISTS "record_facts" CASCADE;
