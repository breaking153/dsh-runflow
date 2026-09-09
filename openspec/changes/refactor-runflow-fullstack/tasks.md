## 1. Baseline and design

- [x] 1.1 Preserve the dirty working tree in an isolated worktree and verify its file inventory.
- [x] 1.2 Record baseline typecheck, full tests and build outputs, including bundle sizes.
- [x] 1.3 Establish one validated OpenSpec change and document the existing design system.

## 2. Frontend resilience

- [x] 2.1 Coordinate workflow drafts, saves and deletes; verify delayed, failed, concurrent and stale-session save regression tests.
- [x] 2.2 Treat browser storage as optional; verify denied access and quota failure do not interrupt editing or Host saves.
- [x] 2.3 Share dialog focus behavior and avoid hidden template work; verify keyboard, Escape recording, truthful save feedback, unmount tests and narrow-screen control access.

## 3. Backend integrity

- [x] 3.1 Propagate pre-existing cancellation; verify both engine and service cancel without running node executors.
- [x] 3.2 Bind source test receipts to source revisions; verify concurrent draft editing cannot certify a new revision.
- [x] 3.3 Publish persistence state only after safe file replacement; verify filesystem failures and concurrent draft commits retain valid data.
- [x] 3.4 Validate persisted record structure; verify malformed files do not break valid workflow and execution listings.

## 4. Privacy and assurance

- [x] 4.1 Remove concrete host information from Markdown and review proposed screenshots; verify the documentation privacy suite and staged-content scan.
- [x] 4.2 Inspect the local preview at four viewport sizes and run the design detector; record accessibility, performance and remaining verification limits.
- [x] 4.3 Independently review the integrated diff and resolve actionable findings with regression checks.
- [x] 4.4 Run fresh complete typecheck, tests, plugin/preview builds and OpenSpec validation; record reproducible evidence in the final report.
- [ ] 4.5 Synchronize and archive the validated change, commit reviewed files, and push the isolated branch; verify the remote commit equals local HEAD.
