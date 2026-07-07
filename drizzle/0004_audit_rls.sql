-- 0004 — RLS for the B3 tenant tables (invites, settings, audit_log) and audit
-- immutability (ADR-001/005). New tables already inherit fourty_app DML from the
-- ALTER DEFAULT PRIVILEGES in 0002; here we add per-table tenant isolation and
-- lock audit history so it cannot be rewritten, even by a bug.

-- Tenant isolation on the three new/altered workspace-scoped tables.
ALTER TABLE "invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invites" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "invites_tenant" ON "invites" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));--> statement-breakpoint

ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "settings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "settings_tenant" ON "settings" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));--> statement-breakpoint

ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "audit_log_tenant" ON "audit_log" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));--> statement-breakpoint

-- Immutability: the app role may INSERT + SELECT audit rows but never change or
-- remove them. REVOKE stops the app; the DO-INSTEAD-NOTHING rules make UPDATE and
-- DELETE no-ops for ANY role (defense in depth). TRUNCATE (test reset) is
-- unaffected by rules.
REVOKE UPDATE, DELETE ON "audit_log" FROM fourty_app;--> statement-breakpoint
CREATE RULE "audit_log_no_update" AS ON UPDATE TO "audit_log" DO INSTEAD NOTHING;--> statement-breakpoint
CREATE RULE "audit_log_no_delete" AS ON DELETE TO "audit_log" DO INSTEAD NOTHING;
