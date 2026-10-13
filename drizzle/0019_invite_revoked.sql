-- 0019 — an admin can take an invite back.
--
-- A revoked invite is refused exactly like an expired one, and inviting the
-- same address again revokes the earlier pending link, so one person has at
-- most one link that works. A column on the existing workspace-scoped table:
-- the RLS policy from 0004 already covers it.
ALTER TABLE "invites" ADD COLUMN "revoked_at" bigint;
