-- Down for 0011 — remove the AI agent / chat tables (thread + messages).
DROP POLICY IF EXISTS "ai_messages_tenant" ON "ai_messages";--> statement-breakpoint
ALTER TABLE "ai_messages" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_messages" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "ai_conversations_tenant" ON "ai_conversations";--> statement-breakpoint
ALTER TABLE "ai_conversations" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_conversations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE IF EXISTS "ai_messages" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "ai_conversations" CASCADE;
