-- Down for 0015 — forget what the signatures said.
ALTER TABLE "email_messages" DROP COLUMN IF EXISTS "signature_raw";--> statement-breakpoint
ALTER TABLE "email_messages" DROP COLUMN IF EXISTS "signature_phone";--> statement-breakpoint
ALTER TABLE "email_messages" DROP COLUMN IF EXISTS "signature_employer";--> statement-breakpoint
ALTER TABLE "email_messages" DROP COLUMN IF EXISTS "signature_title";
