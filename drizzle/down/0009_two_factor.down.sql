-- Down for 0009 — drop the 2FA columns.
ALTER TABLE "users" DROP COLUMN IF EXISTS "backup_codes";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "totp_enabled";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "totp_secret";
