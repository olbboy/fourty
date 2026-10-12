-- 0015 — what a signature block said (Phase 3 of the agentic upgrade).
--
-- Fourty does not store email bodies: `email_messages.snippet` keeps the first
-- 280 characters and the rest is dropped at ingest. A signature block lives at
-- the *end* of a body, so "parse the rows we already have" is false on real
-- data — the extraction has to happen while the body is still in memory, and
-- only its result may land here.
--
-- Hence four nullable columns rather than a `body_text` column: the structured
-- observation plus the quoted block a rep reads as the rationale, bounded to
-- 500 characters. No full body is ever at rest.
--
-- These are attributes of an existing workspace-scoped table, so the RLS policy
-- from 0007 already covers them; there is nothing new to enable.
ALTER TABLE "email_messages" ADD COLUMN "signature_title" text;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "signature_employer" text;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "signature_phone" text;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "signature_raw" text;
