-- 0012 — deal health score (ADR-016, Tier 2).
-- Deterministic 0-100 deal health / win-likelihood score on the deals table,
-- recomputed on create/update by src/lib/services/deal-score.ts. Mirrors the
-- contacts.score column added in 0000. Workspace-scoped row (RLS already on deals).
ALTER TABLE "deals" ADD COLUMN "score" integer DEFAULT 0 NOT NULL;
