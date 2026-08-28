-- 0018 — forgot-password tokens.
--
-- Identity plane like users/sessions: a reset happens before sign-in, so there
-- is no workspace to scope it to and no RLS. Only the sha256 of the token is
-- stored (the same treatment invites and sessions get); the raw value exists in
-- the emailed link and nowhere else. used_at makes a token single-use, and the
-- issue path deletes a user's unused tokens first, so exactly one link works at
-- a time. fourty_app inherits DML from the ALTER DEFAULT PRIVILEGES in 0002.
CREATE TABLE "password_resets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"used_at" bigint,
	"created_at" bigint NOT NULL,
	CONSTRAINT "password_resets_token_hash_unique" UNIQUE("token_hash")
);--> statement-breakpoint
CREATE INDEX "password_resets_user_id_idx" ON "password_resets" ("user_id");
