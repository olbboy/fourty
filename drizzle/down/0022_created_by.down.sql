-- Down for 0022 — forget who made keys and mailboxes.
ALTER TABLE "sync_accounts" DROP COLUMN IF EXISTS "created_by";--> statement-breakpoint
ALTER TABLE "api_keys" DROP COLUMN IF EXISTS "created_by";
