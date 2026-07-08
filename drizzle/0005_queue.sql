-- 0005 — background-job idempotency ledger (Gate B4, ADR-004).
-- A job handler claims its idempotency key in job_receipts (INSERT … ON CONFLICT
-- DO NOTHING) before performing side effects, so at-least-once delivery yields
-- exactly-once results. Workspace-scoped + RLS like every other tenant table;
-- fourty_app inherits DML from the ALTER DEFAULT PRIVILEGES in 0002.
CREATE TABLE "job_receipts" (
	"workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL,
	"key" text NOT NULL,
	"queue" text NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "job_receipts_workspace_id_key_pk" PRIMARY KEY("workspace_id","key")
);
--> statement-breakpoint
ALTER TABLE "job_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "job_receipts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "job_receipts_tenant" ON "job_receipts" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));
