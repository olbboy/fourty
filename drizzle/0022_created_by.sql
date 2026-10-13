-- 0022 — who made an API key, who connected a mailbox.
--
-- So removing a member can take back what they set up. Nullable: keys and
-- mailboxes made before this, or by an API key, have no person behind them.
-- Columns on workspace-scoped tables the existing RLS policies already cover.
ALTER TABLE "api_keys" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "sync_accounts" ADD COLUMN "created_by" text;
