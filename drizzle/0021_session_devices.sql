-- 0021 — who signed in when, and on which devices.
--
-- users.last_login_at answers "who has not signed in for a month". Each session
-- keeps the browser and address it was opened from, and when it was last seen
-- (written at most every few minutes), so a person can recognise and end the
-- sessions they do not want. Identity plane like the tables themselves: no RLS.
ALTER TABLE "users" ADD COLUMN "last_login_at" bigint;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "last_seen_at" bigint;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "ip" text;
