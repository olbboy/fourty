-- Down for 0025 — remove Products and Line items.
DROP POLICY IF EXISTS "deal_lines_tenant" ON "deal_lines";--> statement-breakpoint
ALTER TABLE "deal_lines" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "deal_lines" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE IF EXISTS "deal_lines" CASCADE;--> statement-breakpoint
DROP POLICY IF EXISTS "products_tenant" ON "products";--> statement-breakpoint
ALTER TABLE "products" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "products" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE IF EXISTS "products" CASCADE;
