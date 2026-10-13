-- Down for 0021 — forget devices and sign-in times.
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "ip";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "user_agent";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "last_seen_at";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "last_login_at";
