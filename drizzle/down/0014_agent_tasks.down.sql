-- Down for 0014 — remove the agent work ledger.
DROP POLICY IF EXISTS "agent_tasks_tenant" ON "agent_tasks";--> statement-breakpoint
ALTER TABLE "agent_tasks" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_tasks" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE IF EXISTS "agent_tasks" CASCADE;
