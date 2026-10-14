-- Down for 0027 — remove Quotes.
DROP POLICY IF EXISTS "quotes_tenant" ON "quotes";--> statement-breakpoint
ALTER TABLE "quotes" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "quotes" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE IF EXISTS "quotes" CASCADE;
