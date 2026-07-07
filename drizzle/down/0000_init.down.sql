-- Down migration for 0000_init — reverses every object the up migration creates.
-- drizzle-kit only generates "up" SQL (ADR-002); we hand-author and test the
-- down so migrations are provably reversible.
DROP TABLE IF EXISTS "saved_views" CASCADE;
DROP TABLE IF EXISTS "settings" CASCADE;
DROP TABLE IF EXISTS "api_keys" CASCADE;
DROP TABLE IF EXISTS "workflow_runs" CASCADE;
DROP TABLE IF EXISTS "workflows" CASCADE;
DROP TABLE IF EXISTS "custom_field_defs" CASCADE;
DROP TABLE IF EXISTS "activities" CASCADE;
DROP TABLE IF EXISTS "notes" CASCADE;
DROP TABLE IF EXISTS "tasks" CASCADE;
DROP TABLE IF EXISTS "deals" CASCADE;
DROP TABLE IF EXISTS "stages" CASCADE;
DROP TABLE IF EXISTS "pipelines" CASCADE;
DROP TABLE IF EXISTS "contacts" CASCADE;
DROP TABLE IF EXISTS "companies" CASCADE;
DROP TABLE IF EXISTS "sessions" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;
