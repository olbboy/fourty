-- Down for 0023 — remove the Trash.
DROP POLICY IF EXISTS "trash_tenant" ON "trash";--> statement-breakpoint
ALTER TABLE "trash" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "trash" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE IF EXISTS "trash" CASCADE;
