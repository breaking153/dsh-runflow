## Context

See proposal.md for motivation. React 18, React Flow and Zustand drive a DSH-native editor. A versioned gateway uses the Host's authenticated Remote facade. Cordis services execute workflows and store v2 JSON under a configurable user data directory. Existing uncommitted v2 changes are the baseline and remain intact in the original checkout.

## Goals / Non-Goals

**Goals:** preserve user edits and valid files, make failed operations explicit, maintain existing remote contracts, and make editor dialogs usable with a keyboard. Use a single OpenSpec task list and test actual state transitions.

**Non-Goals:** new trigger capabilities, a replacement Host, cloud services, authentication redesign, database migration, runtime upgrades, or claims of production SLO compliance. No real agent, network, or shell workflow is needed for verification.

## System and threat models

- Business: a DSH main-session user edits, reviews and runs workflows; source authors test trusted node drafts before commit. Lost edits and falsely certified source revisions are unacceptable.
- Data: workflow definitions, execution records, source drafts and test receipts have stable identifiers and explicit ownership. Browser storage is optional cache; Host files are durable state. A failed replacement must preserve the last valid file. A receipt only certifies its exact source revision.
- Execution: browser saves are asynchronous and scoped to the issuing session. Late responses must not overwrite newer drafts or a different session. File writers publish memory only after persistence succeeds. Cancellation is inherited even if it predates listener registration.
- Runtime: local Host and browser are separate failure domains. Disk errors, unavailable cache, malformed persisted records, and slow/failed Remote calls must have defined outcomes. Existing main-agent authorization stays authoritative; providers remain trusted code under Host permissions.
- Privacy: commit candidates include Markdown and screenshots. Remove concrete personal machine paths and credentials, retain public project URLs and generic path examples, and keep raw command logs outside tracked artifacts.

## Decisions

- Ruling: preserve the existing v2 architecture — current tests, PRODUCT.md and code already define gateway/repository boundaries — a broad rewrite would introduce unverified behavior and discard user work.
- Ruling: coordinate drafts and saves per workflow/session — delayed promises expose real data loss — retain dirty drafts on failure and reject stale responses rather than adding a server protocol or optimistic-version migration.
- Ruling: wrap browser cache access — quota and security exceptions must not block Host persistence — a failed cache write can lose optional preferences after reload but not interrupt editing.
- Ruling: share a lightweight dialog focus hook — the editor has several small custom dialogs and no primitive dependency — keep initial focus, Tab wrapping, Escape and focus restoration consistent without a new runtime package.
- Ruling: preserve the DSH blue workbench described in DESIGN.md — product evidence favors a graph-first operating surface — reject dashboard tiles that reduce canvas space and a terminal-only layout that hides visual review.
- Ruling: use same-directory temporary replacement and post-success memory updates — deletion before replacement loses valid files — preserve JSON formats; do not claim cross-process transactions or power-loss durability.
- Ruling: validate persisted record structure at the repository boundary — one corrupt record currently breaks listing — skip unreadable records while preserving files for recovery, and retain healthy records.
- Ruling: push an isolated codex branch — the original checkout contains user work and the user explicitly authorizes push — leave that checkout unchanged and avoid force-push, shared-branch replacement or deployment.

## Verification constraints

- Existing type checks, complete Vitest suite, plugin and preview builds must pass. New race/failure tests first demonstrate failure on the baseline.
- No new production dependencies. Record plugin/preview bundle sizes against the baseline and investigate increases above 5 percent.
- Inspect preview at 375, 768, 1024 and 1440 CSS pixels; verify dialogs fit, controls have names, focus stays visible, and reduced motion preserves state feedback. Automated DOM checks complement screenshots; do not claim full screen-reader certification.
- Run the available Impeccable detector once, assess findings in context, and perform an independent code review before final verification.
- Production latency, throughput, P95/P99, capacity, RPO/RTO and Core Web Vitals cannot be established from local tests; report this explicitly rather than invent targets. File recovery is bounded by the last successfully replaced file, with no power-loss guarantee.

## Risks / Trade-offs

- Same-directory replacement is atomic at the filesystem namespace level, not a multi-file transaction or a disk flush guarantee. Keep formats stable and preserve failure evidence in test results.
- Optional browser caches can be unavailable. The UI keeps working, but preferences may reset on reload.
- New persisted validation may reject previously tolerated malformed documents. Leave them on disk for correction; tests require healthy neighbors to remain usable.
- Browser preview cannot verify live DSH provider integration. Existing Host contract tests use mocked authorities and executors.

## Migration Plan

No data migration is performed. Build artifacts and code are committed only after verification, then pushed to the isolated branch. Integrators can roll back by reverting that commit and rebuilding the previous plugin; stop any running Host instance before changing deployed code. Back up the runtime data directory before a later deployment. This task does not modify production data, rewrite repository history, or deploy the plugin.
