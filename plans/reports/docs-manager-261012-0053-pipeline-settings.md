# Pipeline Settings/API documentation update

Status: DONE_WITH_CONCERNS

## Summary

Updated the assigned documentation surfaces to describe the pipeline and stage
REST contract, RBAC boundary, deletion conflicts, and the Settings reorder
controls. Replaced the stale “no component library” claim with the current
Tailwind plus focused Radix primitives description in the architecture and
product rationale docs. `README.md` did not contain a stale component-library
claim and was left unchanged.

## Evidence

- `src/app/api/pipelines/route.ts` proves `GET`/`POST /api/pipelines`.
- `src/app/api/pipelines/[id]/route.ts` proves `PATCH`/`DELETE` pipeline behavior.
- The nested stage route files prove `POST`/`PATCH /stages` and
  `PATCH`/`DELETE /stages/:stageId` behavior.
- `src/lib/permissions.ts` proves member write access and viewer read-only access
  for `pipelines` and `stages`.
- `tests/pipelines.test.ts` covers workspace isolation, reorder validation,
  default/last/in-use deletion conflicts, and role enforcement.
- `package.json` and the current UI plan prove the Tailwind/Radix stack direction.

## Validation

- `git diff --check`: passed.
- Internal link target for `REST API → Pipelines and stages`: verified.
- `npm test -- tests/pipelines.test.ts`: could not execute because the local
  Postgres test connection rejected the configured `fourty` password
  (`28P01`). The source and existing test assertions were read directly.

## Concern

`src/app/(app)/settings/pipeline-settings.tsx` was not present in the worktree at
the time of review. The Settings wording follows the accepted e2e contract and
plan (`Move up`/`Move down` controls); recheck that wording if the implementation
lands with a materially different accessible control.
