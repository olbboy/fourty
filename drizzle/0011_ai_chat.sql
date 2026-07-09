-- 0011 — in-app AI agent / chat (workspace-scoped + RLS).
-- ai_conversations = one chat thread (user_id is the ownership key — see the note
-- in schema.ts); ai_messages = its turns, carrying the provider round-trip shape
-- (tool_calls / tool_call_id) and the stop-at-write status machine. Both are
-- workspace-scoped + RLS like every other tenant table; ai_messages has a real FK
-- to ai_conversations (ON DELETE CASCADE) — RLS + FK coexist because the parent
-- row is always in the same workspace. fourty_app inherits DML from the ALTER
-- DEFAULT PRIVILEGES in 0002.
CREATE TABLE "ai_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL,
	"user_id" text,
	"title" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_conversations_ws_updated_idx" ON "ai_conversations" ("workspace_id","updated_at");--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL,
	"conversation_id" text NOT NULL REFERENCES "ai_conversations"("id") ON DELETE cascade,
	"role" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"tool_calls" text,
	"tool_call_id" text,
	"status" text DEFAULT 'complete' NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_messages_ws_conv_idx" ON "ai_messages" ("workspace_id","conversation_id","seq");--> statement-breakpoint
ALTER TABLE "ai_conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_conversations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ai_conversations_tenant" ON "ai_conversations" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));--> statement-breakpoint
ALTER TABLE "ai_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_messages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ai_messages_tenant" ON "ai_messages" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));
