-- Down for 0026 — remove Email templates.
DROP POLICY IF EXISTS "email_templates_tenant" ON "email_templates";--> statement-breakpoint
ALTER TABLE "email_templates" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "email_templates" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE IF EXISTS "email_templates" CASCADE;
