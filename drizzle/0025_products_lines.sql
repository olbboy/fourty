-- 0025 — Products and Line items.
--
-- products is the catalogue: name, optional code, list price in one currency.
-- deal_lines are a deal's Line items: a product (or a typed-in item), quantity
-- and unit price in the deal's currency. A line keeps its own name and price,
-- so changing or removing a product never rewrites a deal. When a deal has
-- lines, its amount is their sum (kept by the app, see src/lib/actions/deals/lines.ts).
-- Both workspace-scoped with RLS like every tenant table.
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"unit_price" double precision NOT NULL,
	"currency" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);--> statement-breakpoint
CREATE INDEX "products_ws_name_idx" ON "products" ("workspace_id","name");--> statement-breakpoint
CREATE TABLE "deal_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL,
	"deal_id" text NOT NULL,
	"product_id" text,
	"name" text NOT NULL,
	"quantity" double precision NOT NULL,
	"unit_price" double precision NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL
);--> statement-breakpoint
CREATE INDEX "deal_lines_deal_idx" ON "deal_lines" ("workspace_id","deal_id");--> statement-breakpoint
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "products" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "products_tenant" ON "products" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));--> statement-breakpoint
ALTER TABLE "deal_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "deal_lines" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "deal_lines_tenant" ON "deal_lines" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));
