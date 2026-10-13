-- Down for 0024 — remove Deal contacts.
DROP POLICY IF EXISTS "deal_contacts_tenant" ON "deal_contacts";--> statement-breakpoint
ALTER TABLE "deal_contacts" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "deal_contacts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE IF EXISTS "deal_contacts" CASCADE;
