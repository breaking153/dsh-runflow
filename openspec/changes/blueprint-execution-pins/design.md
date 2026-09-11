## Context

See proposal.md. DAG currently executes each node once after all predecessors; state graphs activate on every edge and group same-step messages by node. Multiplicity currently also means array aggregation. The inspector mixes typed controls and raw fields, while instance ports are copied from descriptors. HTTP's first output is body, so changing port order breaks implicit edges.

## Goals / Non-Goals

**Goals:** Shared property metadata and instance port resolution, actual runtime binding, Blueprint flow/data separation and compatible legacy execution, incumbent graphite node UI, truthful real-Host evidence.

**Non-Goals:** Full Unreal VM emulation, new component dependencies, production service restarts, schema loss or automatic conversion of saved graphs.

## Decisions

- Ruling: isolate changes in an ignored task worktree and integrate reviewed files back without commits — existing master has unrelated retained chunk changes — rollback is a bounded file diff.
- Ruling: persist `promotedInputs?: string[]` on node instances, use declared property paths and safe generated pin IDs — existing providers read node.config — runtime overlays a clone, leaving static defaults and authority intact. Shared metadata derives types from config schemas plus an explicit built-in property catalog; display names and Host webhook credentials are not runtime properties. Retry/timeout must resolve before scheduler settings if exposed.
- Ruling: use adjacent Promote/Restore controls, editable fallback values, and atomic disconnect-and-restore with undo — user explicitly requests adjacent property controls — avoid confirmation gates for reversible graph edits.
- Ruling: execution configuration gains optional `semantics: 'blueprint'`; absence retains legacy behavior, newly created graphs select Blueprint — runtime edge activation meaning changes substantially — users can select compatibility mode for saved graphs.
- Ruling: flow connections are multiple sources but scalar per call, separate from data array aggregation; explicit Join is an all-channel barrier — Epic Custom Events and Functions documentation — no implicit join at shared actions.
- Ruling: independent flow fan-in is enabled by Blueprint semantics; legacy DAG retains its scalar cardinality rejection and legacy state graphs retain their existing aggregation — independent review reproduced silent legacy input replacement — preserving saved behavior takes priority over applying new connection rules to compatibility mode.
- Ruling: an object containing read-only descendants cannot be promoted wholesale, while mutable child paths remain eligible — independent review reproduced parent-overlay bypass — protected provider settings cannot be replaced or removed through a parent binding.
- Ruling: classify providers as trigger/pure/effect; append flow ports to effectful nodes, preserving existing IDs/order — omitted-port edges select the first descriptor — value construction and transforms are pure, state writes/storage/HTTP/Agent/scripts are effectful, triggers and terminators are exceptions.
- Ruling: Blueprint runtime resolves pure data predecessors per consumer invocation and propagates call-local effect outputs, never demand-runs effects — prevents duplicate requests and stale cross-trigger data — detect pure cycles/missing data explicitly and retain call state across checkpoints.
- Ruling: verify each slice using DSH 0.1.5-rc.1 in isolated DSH_HOME with explicit RunFlow storage/output dirs — normal user Host must remain untouched — task-owned debug fixtures/registrations are deleted afterward.

## Risks / Trade-offs

- Runtime semantic migration → explicit option, legacy regression suite, frozen definitions on resume.
- Several flow calls and pure dependencies → invocation-local data and iteration evidence; no global pure cache across loop state changes.
- Property type/path confusion and prototype keys → declared paths, stable collision-safe IDs, validation before invocation, own-property checks, immutable overlay.
- Side-effect retries remain user-configurable → preserve existing settings and cancellation boundaries; no exactly-once external effect claim.
- Dynamic ports and metadata refresh → one effective-port helper across load, paste, catalog refresh and nested graphs; test history and persistence.

## Migration Plan

Implement property bindings and inspect in DSH; implement multi-input activation and inspect; complete node model/demand evaluation and inspect. Run fresh full checks, independent review and fix findings. Integrate bounded changes preserving existing user edits; rebuild linked plugin. Remove debug resources and stop only owned processes. Roll back by restoring changed source files and rebuilding, retaining workflow data.

## References

- [Epic Nodes](https://dev.epicgames.com/documentation/en-us/unreal-engine/nodes-in-unreal-engine)
- [Epic Functions](https://dev.epicgames.com/documentation/en-us/unreal-engine/functions-in-unreal-engine)
- [Epic Custom Events](https://dev.epicgames.com/documentation/unreal-engine/custom-events-in-unreal-engine?lang=en-US)
- [Epic Blueprint Variables](https://dev.epicgames.com/documentation/unreal-engine/blueprint-variables-in-unreal-engine)
- [Epic Animation Node Technical Guide](https://dev.epicgames.com/documentation/unreal-engine/animation-node-technical-guide-in-unreal-engine?lang=en-US)
