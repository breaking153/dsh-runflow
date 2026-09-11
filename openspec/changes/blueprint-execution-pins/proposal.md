## Why

RunFlow properties cannot receive values from other nodes, and ordinary execution inputs reject alternate triggers. Effectful nodes such as HTTP expose no completion flow, leaving users unable to express a continuous Blueprint-style execution chain.

## What Changes

- Expose executable properties as typed input pins with stable persisted bindings, fallback values, reversible demotion, and one-step undo.
- Permit multiple incoming flow wires as independent calls, retaining explicit all-input Join behavior and scalar data cardinality.
- Distinguish triggers, pure value computations, effectful operations, and terminators; complete action flow pins and resolve pure data dependencies on demand under opt-in Blueprint semantics.
- Preserve legacy graphs, port identifiers, implicit first-output edges, Host authority, bounded state loops, and pause/resume.
- Verify each functional slice in the real DSH plugin; clean up task-owned debug resources.

## Capabilities

### New Capabilities
- `blueprint-execution`: Property input bindings, effect/pure classification and Blueprint activation semantics.

### Modified Capabilities
- `canvas-interaction`: Typed promoted inputs and ordinary flow fan-in without changing data cardinality.

## Impact

Shared contracts and property metadata, node catalog/providers, validation, both runtime engines, persistence, editor/store/inspector, tests and documentation. No new runtime dependency, no changes to codex-connect, no production Host restart or credential changes.
