## Context

The current local plugins contain uncommitted user development. npm reports @deepseek-ai/dsh latest=0.1.5-rc.1; the source checkout is 0.1.5-alpha.2. Both plugin typechecks pass before dependency upgrades.

## Decisions

Ruling: Pin the published SDK cohort to 0.1.5-rc.1 — npm registry evidence identifies the newest published runtime — compatibility with older prereleases is not promised.

Ruling: Update current plugin working copies with per-file backups — the Web profile links these copies and their uncommitted features are part of the requested plugins — a clean worktree would omit current user work.

Ruling: Use an isolated temporary DSH home for smoke tests — session and credential stores remain untouched — real provider calls are not validated by keyless checks.

Ruling: Preserve codex-connect package and profile entry — explicit exclusion — any existing compatibility issue in that plugin is reported without repairing it.

Ruling: Explicitly install the official CLI's 24 missing required peers in the Web profile — its existing autoInstallPeers=false removes undeclared peers during reinstall — the local manifest owns exact required versions and must be checked again on the next runtime upgrade.

## Implementation and validation

Upgrade dependency manifests and lockfiles; use new SDK typecheck failures to identify changed consumers. Add focused behavior regressions where fixes alter execution. Build both host and browser artifacts, check browser external imports against DSH's module table, compose an isolated profile, and launch through the supported dsh command. Persist local profile wiring only after validation and back up original configuration.

## Safety and rollback

No new routes, permission policy, database schema, or remote service is planned. Preserve existing validation, cancellation, authorization, and provider errors. Restore backed-up changed files and reinstall previous lockfiles to roll back. Never restart a pre-existing DSH process.
