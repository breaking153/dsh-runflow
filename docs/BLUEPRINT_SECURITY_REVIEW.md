# Blueprint differential security and specification review

Reviewed 2026-09-10 against `f1930b5` in `.worktrees/blueprint-pins`. The implementation was uncommitted. This reviewer did not implement the feature or change its implementation; it added the independent regression file `tests/blueprint-security-review.spec.ts` and this report. Implementation owners fixed the findings below.

## Executive assessment

**Recommendation: APPROVE within the reviewed runtime/security scope.** No unresolved actionable finding remains after independent verification of both fixes. This does not replace the coordinator's complete build, UI, real-Host, and integration checks.

| Severity | Found during review | Unresolved |
| --- | ---: | ---: |
| Critical | 0 | 0 |
| High | 0 | 0 |
| Medium / P2 | 2 | 0 |
| Low | 0 | 0 |

The change was treated as high-risk during analysis because it changes when effectful providers execute and which values reach their configuration. Residual confidence is high for the reproduced fixes and tested runtime invariants; this is a focused review rather than a complete security audit.

## Scope and changes

The repository contains 99 TypeScript/TSX source files under `src`, `nodes`, and `script`; a focused strategy was used. At the final review snapshot, the tracked working-tree diff contained 39 files with 783 added and 194 removed lines when ignoring end-of-line differences. Those numbers exclude new untracked files and include changes outside this reviewer’s primary scope; they are not a coverage claim.

Deeply reviewed feature paths:

- `src/node-properties.ts`, `src/contracts.ts`, and `src/backend/v2/document-validation.ts`: declared property paths, effective ports, JSON values, immutable configuration overlays, persistence shape.
- `src/engine.ts`, `src/state-graph.ts`, and `src/blueprint-runtime.ts`: legacy/Blueprint dispatch, entry selection, flow/data distinction, invocation-local data, Join, pure demand, cancellation, checkpoints and resume.
- `src/node-execution.ts`, `src/core-node-execution.ts`, and `src/node-library.ts`: provider metadata validation and completion output handling.
- `src/control-node-catalog.ts`, `src/value-node-catalog.ts`, `nodes/builtins.ts`, `nodes/control-nodes.ts`, and `nodes/value-nodes.ts`: shipped effect/pure/trigger classifications and execution properties.

One-hop context included `src/remote-service.ts`, `src/flow-service.ts`, `src/port-types.ts`, and `src/output-store.ts`. Property-related editor/store paths were inspected for path construction, repairable metadata, and UI-to-Host validation boundaries. Visual appearance, full editor interaction coverage, remaining presentation-only changes, and retained README/Vite changes were not independently audited here.

The acceptance reference was `openspec/changes/blueprint-execution-pins`: executable property inputs, independent flow activation, complete executable node model, and compatible bounded execution. The real-Host visual acceptance requirement belongs to the coordinator's verification, not this review's unit-test evidence.

## Resolved findings

### P2-01: Parent promotion bypassed a nested read-only property

**Status: fixed and independently verified.** Relevant current code: `src/node-properties.ts:119` and `src/node-properties.ts:127`.

Initially, `configurableProperties()` excluded a child marked `readOnly: true` but still exposed its parent object. A workflow author could promote `options`, wire `{ "endpoint": "dynamic", "locked": "replaced" }`, and replace `options.locked` despite the provider declaring that child read-only. `resolveNodeConfig()` accepted the whole object and passed it to the consumer. The saved definition stayed unchanged, but the invoked configuration violated the advertised property eligibility rule.

**Access and impact:** requires a custom provider declaring such a schema and an authorized workflow author or an upstream value driving its promoted parent. No shipped nested read-only setting was found. This was a property-policy bypass, not a demonstrated cross-Agent authorization or credential-store compromise. It affected both runtime engines through the shared configuration resolver.

**Evidence:** the independent test `does not let parent promotion replace a nested read-only setting` initially failed with expected `host-value`, received `replaced`. Existing selected tests still passed, demonstrating a coverage gap. The fix excludes a parent replacement when supported nested schema declarations contain read-only descendants, while preserving individually promotable mutable descendants. Additional owner tests cover nested objects, array items, dictionaries, and a read-only configuration root. The independent reproduction now passes.

**History:** the property promotion module is new in this uncommitted change, so this was a new boundary inconsistency rather than a restored historical vulnerability.

### P2-02: Flow cardinality relaxation affected legacy DAGs

**Status: fixed and independently verified.** Relevant current code: `src/engine.ts:152`.

The first implementation exempted all flow inputs from scalar incoming-edge cardinality checks. That exemption applied even when `execution.semantics` was absent. A legacy DAG with two flow sources connected to the same scalar sink changed from validation failure to acceptance; the legacy resolver would overwrite the earlier input rather than preserve the prior rejection. This contradicted the requirement that absent semantics preserve legacy behavior.

**Access and impact:** ordinary authorized workflow construction through save/start validation. A malformed legacy graph could unexpectedly invoke its sink using one of the incoming values. This was a compatibility and input-integrity regression, not an authorization bypass.

**Evidence:** the independent test `retains legacy DAG scalar flow cardinality validation` initially received `[]` instead of a `PORT_CARDINALITY` issue. The exemption now requires `semantics === 'blueprint'`; legacy DAG rejection and the existing legacy state-graph policy are preserved. The independent reproduction now passes.

**History:** baseline `git blame` identifies the scalar cardinality guard at `src/engine.ts:125-135` as originating in `8ca53ed`; `b2f045f` subsequently added the explicit legacy state-graph exception. The reviewed change accidentally broadened that exception. No security/CVE-related guard removal was identified in the reviewed history.

## Trust boundaries and adversarial checks

| Boundary or threat | Evidence and assessment |
| --- | --- |
| Reserved property paths and prototype injection | Promotion rejects reserved segments, malformed/dotted paths, duplicate/overlapping paths and generated-port collisions. Nested reads use own-property checks; resolved configuration is cloned. JSON objects may contain ordinary metadata keys named `constructor` or `__proto__` without turning those into a traversed property path. |
| Host-owned trigger settings | Trigger configuration is excluded from promotion; retry and timeout remain scheduler settings. Root read-only configuration and protected descendants are now excluded. |
| Independent trigger calls | Flow activations carry a call ID and predecessor outputs. Data reads use that call’s outputs, not global last-output dictionaries. Tests cover a shared provider revisited by other calls and unavailable data from an already-completed unrelated trigger. |
| Join authority | Join selects all required channels from one call. Conflicting sibling output histories fail rather than silently overwrite each other. Independent trigger calls do not satisfy each other’s barrier. |
| Pure demand versus effects | `blueprintInputMessages()` demand-runs only providers classified pure. Missing effect data fails instead of invoking that provider. Pure control envelopes are rejected before state updates or continuation are committed. |
| Stale pure values | The cache is created per top-level consumer invocation in `src/state-graph.ts:262`; later calls, loop visits and resumed consumer invocations receive fresh caches and current committed state snapshots. It is not a global cache and is not restored from checkpoints. |
| Repeated effects and completion | Only flow edges enqueue Blueprint successors. Data wires only supply inputs. Completion is appended after successful normalization, with interrupt/halt/routes remaining authoritative and the original terminal projection preserved. Tests cover flow plus data from one effect and failure without success continuation. |
| Cancellation, timeouts and finite execution | Demanded providers use the same abort-aware node execution boundary as scheduled providers. Pure cycles fail. State-graph step limits remain checked; late provider work still requires cooperative cancellation, as before. |
| Checkpoint and resume authority | `validBlueprintCheckpoint()` checks semantics, call structure, declared output names, flow-channel identity and paused-call matching. Remote resume accepts an execution ID and response, not an arbitrary checkpoint. `RunFlowRemoteService.resume()` checks ownership at `src/remote-service.ts:130`; `FlowService.resume()` independently checks ownership and uses the saved definition/checkpoint at `src/flow-service.ts:342`. Tests verify paused-call prioritization and no reuse of one response for the next queued call. |
| Artifact paths | The new pure path uses the existing writer and `safeOutputSegment()` for node directory components. Iterations are reserved per invocation, including shared pure nodes, so evidence is separated by step/iteration. This review does not certify arbitrary output-root permissions. |

Checkpoints are structurally validated, not cryptographically authenticated. A party able to alter trusted local execution files is outside the remote workflow-author boundary and can alter stored execution evidence; this review does not claim resistance to that attacker. Similarly, `executionKind: 'pure'` is a trusted provider declaration, not a sandbox proving arbitrary provider code has no external side effects. Dynamic HTTP URLs and script arguments do not introduce a new authentication boundary; existing provider/tool authorization still governs those operations.

## Caller and blast-radius analysis

Counts are direct production call sites, excluding declarations, imports and tests; a shared scheduler call can affect every executed node.

| Function | Direct call sites | Effective blast radius |
| --- | ---: | --- |
| `resolveNodeConfig` | 2 | Every invoked node in DAG and state-graph/Blueprint execution |
| `effectiveNodeDescriptor` | 6 | Host validation/input resolution and editor property projection |
| `validateExecutionDescriptor` | 4 | Workflow validation and three node-library registration/draft boundaries |
| `completeNodeOutput` | 3 | DAG normalization plus state-graph envelope/plain-value paths |
| `executeStateGraph` | 1 | Every state graph and every explicit Blueprint workflow |
| `blueprintInputMessages` | 1 | All Blueprint scheduled and demanded input resolution |
| `mergeBlueprintCalls` | 1 | Every top-level Blueprint invocation, including Join |
| `validBlueprintCheckpoint` | 1 | All Blueprint checkpoint resume validation |

The important transitive chain is authorized Remote/service start or resume → workflow validation → engine dispatch → call-scoped input resolution → optional pure demand → configuration overlay → provider execution → completion/routing → durable checkpoint. The low direct caller counts do not imply low operational impact.

## Verification and coverage

Initial independent probes exposed two failures while the existing selected tests passed. After both owners’ fixes, a fresh reviewer-run command completed successfully:

```powershell
pnpm exec vitest run tests/blueprint-security-review.spec.ts tests/node-properties.spec.ts tests/node-property-runtime.spec.ts tests/node-completion.spec.ts tests/blueprint-activation.spec.ts tests/blueprint-pure.spec.ts tests/provider-blueprint.spec.ts tests/node-library.spec.ts tests/state-graph.spec.ts tests/flow-state-service.spec.ts tests/flow-remote.spec.ts tests/engine.spec.ts
```

**Result: 12 test files passed, 170 tests passed** on 2026-09-10 at 21:54 local time. This includes the two independent reproductions, invalid property values, metadata rejection, legacy execution, sibling/independent calls, pure dependency cycles, per-consumer caches, timeout/cancellation, serialized pause/resume, service ownership, and Remote ownership.

No instrumented line/branch coverage percentage was collected. Tests do not establish full JSON Schema support, malicious-provider sandboxing, exactly-once external effects, or crash consistency across an arbitrary external side effect and checkpoint write. These are explicit limits, not claims of verified protection.

## Historical context and methodology

The baseline timeline is `8ca53ed` (original engine) → `b2f045f` (state graph, trigger ingress and scoped runtime) → `88cea3c` (typed canvas stabilization) → `f1930b5` (SDK alignment) → this working-tree feature. The existing checkpoint shape and ownership/resume path were traced against the baseline. No commits or checkouts were created by the reviewer.

Methods used: differential reading, baseline diff, `git blame`, and history inspection, direct caller counts, trust-boundary tracing, comparison with OpenSpec acceptance scenarios, adversarial property and legacy-graph probes, and focused regression tests. No builds, browser automation, live Host startup, credentials, network calls, or real external provider calls were used by this reviewer. Complete UI acceptance, real-Host evidence, full-suite validation and preservation during integration remain the coordinator’s responsibility.

## Remaining recommendations

No further implementation correction is requested from the reviewed evidence. Retain the two independent regression cases, complete the coordinator's final validation, and keep the existing documentation limits on external retries, provider trust and local checkpoint authority.
