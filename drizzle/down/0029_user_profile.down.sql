-- Down for 0029 — drop the profile columns.
ALTER TABLE "users" DROP COLUMN IF EXISTS "phone";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "title";
