# Deal form pipeline/stage consistency

## Outcome

- `DealForm` keeps `stageId` in controlled React state.
- New deal pipeline changes reset the stage to the first stage in the selected pipeline.
- New deal submissions derive the pair from the selected pipeline and stage and refuse to submit when no valid stage exists.
- Existing deal edits continue to use the deal's pipeline and validate changed stages against that pipeline.
- Added `e2e/deal-form.spec.ts`, which changes a new deal from Sales/Won to Enterprise and asserts the submitted stage is Enterprise/Discovery and belongs to the submitted pipeline.

## Validation

- `npx tsc --noEmit` passes.
- `git diff --check -- src/app/(app)/deals/deal-form.tsx e2e/deal-form.spec.ts` passes.
- `npx playwright test e2e/deal-form.spec.ts --project=smoke --list` lists the new spec.
- Full browser execution is blocked in this shared checkout by an existing build error in `src/app/(app)/settings/pipeline-settings.tsx` (`error` is undefined, then `settings.pipelinesReadOnly` is missing from the i18n key type) and the local E2E Postgres credentials are unavailable (`fourty_app` authentication failed).

Status: DONE
Summary: Deal form pipeline/stage state and focused browser coverage are implemented.
Concerns/Blockers: Browser execution awaits unrelated settings build/type fixes and valid E2E Postgres credentials.
