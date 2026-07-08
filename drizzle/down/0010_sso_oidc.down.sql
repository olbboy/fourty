-- Down for 0010 — drop the SSO/OIDC tables (global identity plane, no RLS).
DROP TABLE IF EXISTS "sso_login_states";--> statement-breakpoint
DROP TABLE IF EXISTS "sso_connections";
