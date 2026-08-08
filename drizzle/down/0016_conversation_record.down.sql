-- Down for 0016 — unbind conversations from records.
DROP INDEX IF EXISTS "ai_conversations_record_idx";--> statement-breakpoint
ALTER TABLE "ai_conversations" DROP COLUMN IF EXISTS "entity_id";--> statement-breakpoint
ALTER TABLE "ai_conversations" DROP COLUMN IF EXISTS "entity_type";
