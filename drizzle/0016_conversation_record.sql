-- 0016 — bind a conversation to the record it is about (Phase 4).
--
-- The per-record agent panel is a conversation *about this contact*, so the
-- record has to be on the row rather than appended to the user's message text:
-- text is something the model can be talked out of, a column is not. Both
-- columns stay nullable — the global chat drawer is about no single record and
-- keeps writing rows with neither.
--
-- The binding is written server-side from a record the caller was able to read.
-- A client-supplied id is never trusted here.
--
-- Attributes of an existing workspace-scoped table, so 0011's RLS policy already
-- covers them.
ALTER TABLE "ai_conversations" ADD COLUMN "entity_type" text;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD COLUMN "entity_id" text;--> statement-breakpoint
-- "this user's threads about this record, newest first" — the panel's only list.
CREATE INDEX "ai_conversations_record_idx" ON "ai_conversations" ("workspace_id","entity_type","entity_id","user_id","updated_at");
