-- 0027 — Quotes (D16).
--
-- A priced offer made from a deal's line items at one moment: numbered per
-- workspace and year (BG-2026-0001), valid until a date, with the buyer, the
-- lines and the total copied in. A snapshot: changing the deal later never
-- changes a quote already made. Workspace-scoped with RLS.
CREATE TABLE "quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL,
	"deal_id" text NOT NULL,
	"number" text NOT NULL,
	"issued_at" bigint NOT NULL,
	"valid_until" bigint NOT NULL,
	"currency" text NOT NULL,
	"total" double precision NOT NULL,
	"snapshot" text NOT NULL,
	"terms" text,
	"created_by" text,
	"created_at" bigint NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_ws_number_idx" ON "quotes" ("workspace_id","number");--> statement-breakpoint
CREATE INDEX "quotes_deal_idx" ON "quotes" ("workspace_id","deal_id");--> statement-breakpoint
ALTER TABLE "quotes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "quotes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "quotes_tenant" ON "quotes" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));
