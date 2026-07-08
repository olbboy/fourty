-- 0009 — two-factor auth (Gate D2, ADR-012).
-- Columns on the global users table (identity plane — not workspace-scoped, no
-- RLS). totp_secret is the Base32 secret; totp_enabled flips on after the first
-- code verifies; backup_codes is a JSON array of sha256-hashed recovery codes.
ALTER TABLE "users" ADD COLUMN "totp_secret" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_enabled" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "backup_codes" text DEFAULT '[]' NOT NULL;
