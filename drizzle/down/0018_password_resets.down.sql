-- Down for 0018 — remove forgot-password tokens. Identity plane (no RLS to
-- unwind); the index goes with the table.
DROP TABLE IF EXISTS "password_resets" CASCADE;
