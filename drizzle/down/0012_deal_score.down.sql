-- Down for 0012 — drop the deal health score column.
ALTER TABLE "deals" DROP COLUMN IF EXISTS "score";
