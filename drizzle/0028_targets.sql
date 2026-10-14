-- 0028 — Targets (D17).
--
-- The Amount a member is expected to win in one calendar quarter, in the
-- workspace's reporting currency; one per member and quarter. Workspace-scoped
-- with RLS.
CREATE TABLE "targets" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL,
	"user_id" text NOT NULL,
	"period" text NOT NULL,
	"amount" double precision NOT NULL,
	"updated_by" text,
	"updated_at" bigint NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "targets_ws_user_period_idx" ON "targets" ("workspace_id","user_id","period");--> statement-breakpoint
ALTER TABLE "targets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "targets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "targets_tenant" ON "targets" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));
