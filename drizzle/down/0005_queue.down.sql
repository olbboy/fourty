-- Down for 0005 — remove the job idempotency ledger.
DROP POLICY IF EXISTS "job_receipts_tenant" ON "job_receipts";--> statement-breakpoint
ALTER TABLE "job_receipts" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "job_receipts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE IF EXISTS "job_receipts" CASCADE;
