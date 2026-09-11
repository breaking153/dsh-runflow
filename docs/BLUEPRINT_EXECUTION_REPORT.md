# Blueprint execution and property inputs

Status: complete, integrated and verified on 2026-09-10. All OpenSpec tasks are checked. The main checkout and its linked DSH plugin have been rebuilt; no commit or production Host restart was performed.

OpenSpec change: `blueprint-execution-pins` (spec-driven, strictly validated planning artifacts). Baseline: `f1930b5`. Work was isolated in `codex/blueprint-pins-20260910`; earlier README/Vite chunk-splitting changes were preserved.

## Accepted behavior

Properties can be exposed as typed data inputs while retaining editable fallback values. Multiple ordinary flow inputs represent independent calls; explicit Join represents synchronization. Triggers start execution, effects continue through completion flow, pure computations provide values on demand, and terminators deliberately end flow. New Blueprint semantics are explicit so legacy graphs keep their prior behavior.

See the change design for decision records and official Epic references. "Promote" in this editor means expose a property as an input pin, not Unreal's separate Promote to Variable command.

## Verification record

| Slice | Automated behavior | Real DSH visual check | Result |
| --- | --- | --- | --- |
| Property inputs | 39 runtime property cases; 10 client cases plus existing regressions; two independent review regressions fixed | Real DSH URL and duration pins created and dragged; HTTP used promoted URL; Restore used saved URL; Undo and browser reload retained connected pins; review-fix build inspected | Passed |
| Multiple flow inputs | 115 runtime cases across 8 suites; 81 client cases across 8 suites; fresh root typecheck and 47 focused cases passed | Dragged two Trigger wires into one flow input; shared and successor each ran twice with scalar flow; inspected Blueprint semantics selector | Passed |
| Node model | 215 runtime/integration cases across 17 suites; all client regressions; invocation-local pure cache, completion projection and resume | HTTP completion dragged to Storage; pure URL/JSON supplied both calls; false/zero/empty preserved; keyboard Restore/Undo and four inspector widths checked | Passed, including final layout recheck |
| Integration | Main checkout: 62 test files / 469 tests, full typecheck, plugin/preview builds, strict specs, independent review | Final main-checkout plugin verified in real DSH; debug registration and test workflows removed; owned processes stopped | Passed |

## Environment and limits

Phase 1 evidence (2026-09-10): `docs/assets/evidence/playwright/blueprint-phase1-wired.png` and `blueprint-phase1-success.png` in the primary checkout; backend evidence in ignored `.ua/blueprint-host/phase1-runtime-evidence.json`. The final run succeeded with HTTP `/property-check?source=promoted`, duration input `25`, and saved duration fallback `150`. Restoring URL produced `/property-check?source=default`. Browser reload retained connected `property-url` and `property-duration_4d_s`; fresh browser console had zero errors. Independent review reproduced and fixed late-provider omitted-port hydration and scalar promoted-input cardinality; inspector title contrast was also corrected for the next build.

Real-Host checks use DSH 0.1.5-rc.1 with a task-owned home and explicit RunFlow storage/output directories. No real credentials, model requests, production Host restarts, codex-connect changes, commits or publishing are required. Local fixtures exercise network completion without sending user data to external services. External provider effects still depend on their own cancellation/idempotency behavior; this change makes no exactly-once guarantee.

Phase 2 evidence: `docs/assets/evidence/playwright/blueprint-phase2-shared-flow.png` and `blueprint-phase2-settings.png`; `.ua/blueprint-host/phase2-runtime-evidence.json`. Actual UI execution `506bd7da-b257-4084-85a1-ffda4c5615aa` succeeded in four steps: Trigger A and B each ran once, Shared logic and Continue each ran twice. Incoming flow remained scalar. The settings panel displayed Blueprint semantics and its separate-call explanation.

Phase 1 follow-up visual: `docs/assets/evidence/playwright/blueprint-phase1-review-fixed.png` confirms the corrected inspector title, adjacent controls and retained wires. Computed title text/background were `rgb(226,231,239)` / `rgb(29,35,45)`.

Phase 3 evidence: `docs/assets/evidence/playwright/blueprint-phase3-success.png`; `.ua/blueprint-host/phase3-runtime-evidence.json`. Real UI execution `50a37480-512d-410b-bf59-2bd739fbd091` succeeded in five steps. Both Triggers ran once; URL, payload, HTTP, Storage and Continue each ran twice. HTTP POST used `/node-model?source=pure`, with `{enabled:false,count:0,message:""}` intact. Storage received the parsed body and produced durable artifact receipts. Each operation displayed two calls.

Fresh full worktree verification: 62 files / 468 tests passed; Host and client typecheck passed; plugin and preview builds passed; OpenSpec strict validation passed. Preview chunks measured 330.67 kB and 384.04 kB, below the unchanged 500 kB warning threshold. The DSH client remains the Host's single CJS plugin bundle (1.60 MB); the preview split is a separate build contract. The existing tsdown CJS recommendation remains informational.

Independent [security review](./BLUEPRINT_SECURITY_REVIEW.md) resolved two P2 findings: parent property bindings could replace a read-only descendant, and a new flow exemption had weakened legacy DAG validation. Dedicated reproductions and 170 focused checks passed; no unresolved actionable findings in that review scope. See [UI evidence and limits](./BLUEPRINT_EXECUTION_UI_AUDIT.md).

Final main-checkout evidence: `docs/assets/evidence/playwright/blueprint-final-success.png`, `blueprint-final-autofit.png`, `blueprint-final-375.png` and `blueprint-final-768.png`. Without manually fitting the canvas, all seven node rectangles were inside its bounds on first editor entry. The narrow inspector tabs were unobstructed. Real UI execution `f3ee784b-8982-4dac-99fa-ae932758fb35` again succeeded with both HTTP calls and their successors; `.ua/blueprint-host/final-runtime-evidence.json` retains this record. Fresh console: zero errors/warnings. The final root check passed 469 tests; preview chunks were 330.67 kB and 384.07 kB. No source change followed those tests except verification documentation/task status.

Integration copied 72 reviewed source/spec/doc files after checking the original checkout and hashes of the earlier README/Vite edits. Exact pre-integration files and an ownership manifest remain in ignored `.ua/blueprint-host/pre-integration` and `integration-manifest.json`. The user's Web profile still links `dsh-runflow` to the primary project checkout; codex-connect was untouched. A currently running user Host must reload the rebuilt plugin through its normal restart/reload path to use the new code.

Cleanup verified: `debug.property-values` source removed, live Host catalog contained no `debug.*` providers, and all three task-owned test workflows were removed. The isolated Host (PID 91552), HTTP fixture (PID 82856) and task browser were closed; ports 18946/18947 had no listeners. Private browser auth state was deleted. Test execution evidence/screenshots remain for review; no debug provider is shipped. Details are in ignored `cleanup-evidence.json` and `process-cleanup.json`.

## Rollback

Restore the bounded source diff and rebuild the linked plugin. The task's pre-integration backup distinguishes replaced files from new files; preserve the earlier README/Vite edits and workflow/execution data. Workflows that opt into Blueprint semantics or expose new property pins require this version; use their retained legacy definition before rolling back. Debug cleanup is already complete.

## Skill and tool status

Existing OpenSpec CLI, pnpm, TypeScript, Vitest, tsdown/Vite and Playwright CLI are executable tools. OpenSpec apply, TDD, verification, Impeccable, Playwright and review instructions are compatibility-loaded from existing skill files; no newly installed skill or hook is claimed as natively activated. Collaboration agents are native task tools. No new runtime library is planned.
