-- 0007 — email + calendar sync (Gate C6, ADR-009).
-- sync_accounts = a connected mailbox/calendar; email_messages + calendar_events
-- are ingested records, deduped by provider id (Message-ID / ICS UID) and linked
-- to a contact by participant email. Workspace-scoped + RLS; fourty_app inherits
-- DML from the ALTER DEFAULT PRIVILEGES in 0002.
CREATE TABLE "sync_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL,
	"provider" text NOT NULL,
	"email" text NOT NULL,
	"label" text,
	"config" text DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_synced_at" bigint,
	"last_error" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sync_accounts_ws_idx" ON "sync_accounts" ("workspace_id");--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL,
	"account_id" text NOT NULL,
	"message_id" text NOT NULL,
	"thread_id" text,
	"direction" text DEFAULT 'inbound' NOT NULL,
	"from_addr" text,
	"to_addrs" text DEFAULT '[]' NOT NULL,
	"subject" text,
	"snippet" text,
	"contact_id" text,
	"sent_at" bigint,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "email_messages_dedup_idx" ON "email_messages" ("workspace_id","account_id","message_id");--> statement-breakpoint
CREATE INDEX "email_messages_contact_idx" ON "email_messages" ("workspace_id","contact_id");--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL,
	"account_id" text NOT NULL,
	"uid" text NOT NULL,
	"title" text,
	"description" text,
	"location" text,
	"attendees" text DEFAULT '[]' NOT NULL,
	"contact_id" text,
	"start_at" bigint,
	"end_at" bigint,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_events_dedup_idx" ON "calendar_events" ("workspace_id","account_id","uid");--> statement-breakpoint
CREATE INDEX "calendar_events_contact_idx" ON "calendar_events" ("workspace_id","contact_id");--> statement-breakpoint
ALTER TABLE "sync_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sync_accounts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sync_accounts_tenant" ON "sync_accounts" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));--> statement-breakpoint
ALTER TABLE "email_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "email_messages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "email_messages_tenant" ON "email_messages" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));--> statement-breakpoint
ALTER TABLE "calendar_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "calendar_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "calendar_events_tenant" ON "calendar_events" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));
