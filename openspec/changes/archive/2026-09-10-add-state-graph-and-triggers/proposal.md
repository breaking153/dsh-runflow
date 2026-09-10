## Why

RunFlow currently executes DAG nodes once. It cannot express bounded feedback loops, shared state reduction, or resumable pauses. Some missing output ports still activate downstream branches. Normal DSH Agents lack a runtime-only Flow tool, and fallback authoring registrations can outlive the plugin. Webhook nodes advertise an unavailable listener.

## What Changes

- Add an opt-in native state-graph runtime with deterministic step barriers, shared state reducers, explicit routing, bounded cycles, and persisted node-boundary pauses.
- Supply branch, switch, parallel, join, loop, state read/update, interrupt and end nodes; preserve existing DAG workflows and fix inactive-edge propagation.
- Support manual, Agent and authenticated webhook entry points without letting request data choose execution authority.
- Register runtime tools and skills with the active plugin, keep authoring scoped to its configured preset, and remove all contributions when the plugin stops.
- Extend the editor with execution settings, state and step evidence, pause/resume controls, and live webhook bindings.

## Capabilities

### New Capabilities
- `state-graph-execution`: Stateful routing, reduction, bounded loops and checkpointed pause/resume.
- `flow-trigger-ingress`: Trusted manual/Agent entries and authenticated live webhook bindings.
- `flow-plugin-lifecycle`: Normal Agent runtime tools, scoped authoring, runtime skills and unload cleanup.

### Modified Capabilities

None. Prior persistence and editor-resilience contracts remain applicable.

## Impact

Contracts, engine, built-in node library, FlowService, file persistence, Remote, editor and runtime skills change together. Existing definitions default to DAG execution; the editor offers state graphs for new work. No LangGraph dependency, new daemon, production deployment, permission-policy modification or existing-file migration is required.
