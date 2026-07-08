-- 0010 — SSO / OIDC (Gate D4, ADR-014).
-- sso_connections = instance-level OIDC providers (issuer + client credentials);
-- sso_login_states = short-lived per-login PKCE verifier + nonce keyed by the
-- one-time `state`. Both live on the global identity plane (like users/sessions):
-- OIDC login runs before a workspace is selected, so there is no workspace_id and
-- no RLS. fourty_app inherits DML from the ALTER DEFAULT PRIVILEGES in 0002.
CREATE TABLE "sso_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"issuer" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret" text NOT NULL,
	"scopes" text DEFAULT 'openid email profile' NOT NULL,
	"enabled" integer DEFAULT 1 NOT NULL,
	"default_workspace_id" text,
	"default_role" text DEFAULT 'member' NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sso_login_states" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"code_verifier" text NOT NULL,
	"nonce" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sso_login_states_expiry_idx" ON "sso_login_states" ("expires_at");
