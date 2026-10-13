-- 0020 — notes can be corrected.
--
-- The author or an admin may edit a note; edited_at marks that it changed after
-- it was written, so a reader knows the text is not the original. A column on
-- the existing workspace-scoped table: the RLS policy already covers it.
ALTER TABLE "notes" ADD COLUMN "edited_at" bigint;
