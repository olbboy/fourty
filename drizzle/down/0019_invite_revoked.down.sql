-- Down for 0019 — forget which invites were taken back.
ALTER TABLE "invites" DROP COLUMN IF EXISTS "revoked_at";
