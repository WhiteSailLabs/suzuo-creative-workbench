# Task 7 report

## Scope

- Added `ReviewCenter` for single-user internal reviews bound to version, asset, and region.
- Added review status transitions: passed, needs changes, alternative, and rejected; pending counts remain visible.
- Extended `ProposalView` with internal/customer audience switching, internal pending-verification warnings, structured customer gate errors, and a culture verification entry point.
- Added `DownloadPanel` with individual local PNG/GLB links plus Brief/culture/version data through the API manifest. No ZIP is fabricated.
- Wired review and proposal views into `App` while preserving explicit `projectId` navigation.
- Added `manifestUrl` to the API helpers.

## Verification

- `npm test -- --run src/components/ReviewCenter.test.tsx src/components/ProposalView.test.tsx`
- `npm test -- --run` (64 tests passed)
- `npm run build`
- `git diff --check`

The browser print action remains the P0 PDF path (`window.print()`); server-side PDF generation is intentionally not introduced.
