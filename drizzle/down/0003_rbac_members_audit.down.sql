-- Down for 0003 — drop the B3 tables/columns and restore the single-column
-- settings PK. Run AFTER 0004's down (which drops the policies referencing
-- settings.workspace_id / audit_log).
DROP TABLE IF EXISTS "invites" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "audit_log" CASCADE;--> statement-breakpoint
ALTER TABLE "api_keys" DROP COLUMN IF EXISTS "role";--> statement-breakpoint
ALTER TABLE "workspace_members" DROP COLUMN IF EXISTS "deactivated_at";--> statement-breakpoint
ALTER TABLE "settings" DROP CONSTRAINT IF EXISTS "settings_workspace_id_key_pk";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN IF EXISTS "workspace_id";--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_pkey" PRIMARY KEY ("key");
