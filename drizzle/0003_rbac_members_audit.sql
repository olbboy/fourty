CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"object_type" text,
	"object_id" text,
	"meta" text DEFAULT '{}' NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"accepted_at" bigint,
	"invited_by" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "role" text DEFAULT 'admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD COLUMN "deactivated_at" bigint;--> statement-breakpoint
ALTER TABLE "settings" DROP CONSTRAINT "settings_pkey";--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "workspace_id" text DEFAULT current_setting('app.workspace_id', true) NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_workspace_id_key_pk" PRIMARY KEY("workspace_id","key");--> statement-breakpoint
CREATE INDEX "audit_log_ws_idx" ON "audit_log" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_object_idx" ON "audit_log" USING btree ("workspace_id","object_type","object_id");--> statement-breakpoint
CREATE INDEX "invites_ws_idx" ON "invites" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "invites_email_idx" ON "invites" USING btree ("workspace_id","email");
