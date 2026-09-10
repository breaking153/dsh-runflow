# DSH RunFlow Web Capability Map

Interaction baseline: approved on 2026-09-01. Updated on 2026-09-10 for the state-graph and trigger extension. Behaviour reference: ComfyUI Frontend v1.51.9 (`71d2f2f2b5c6da9dee281836b5b72f3af368966f`). The reference is used to understand interaction behaviour only; RunFlow keeps its own React implementation and DSH visual language. New capabilities below describe implementation scope, not a claim that final integration verification is complete.

## Product boundary

RunFlow adopts transferable graph-editor behaviour: canvas navigation, discovery, editing history, clipboard, groups, reroutes, workflow tabs, reusable templates/subflows, execution queue/history, commands, and keybindings.

RunFlow does not adopt ComfyUI-specific media preview panels, model/assets management, mask editor, extension marketplace, cloud login, terminal, or Comfy-specific node widgets.

## Module map

| Module | Owns | Depends on | Delivery |
| --- | --- | --- | --- |
| `command-keybindings` | Command registry, shortcut routing, command palette, editable-target guards | Existing editor actions | Phase 1 |
| `graph-history-clipboard` | Snapshot history, undo/redo, copy/paste/duplicate/delete transactions | command-keybindings | Phase 1 |
| `canvas-context-selection` | Pane/node/selection menus, selection toolbar, link visibility, viewport controls | graph-history-clipboard | Phase 1 |
| `node-discovery-library` | Persistent sidebar Nodes tab, slash-path provider groups, fuzzy search, keyboard navigation, recent nodes, compatible-port filtering, drag/drop | command-keybindings | Phase 2 + Phase 5 |
| `graph-organization` | Groups, rename, reroutes, link visibility and minimap controls | canvas-context-selection | Phase 2 |
| `workflow-tabs-templates` | Sidebar workflow switching, active/dirty state, reusable graph templates | graph-history-clipboard | Phase 3 + Phase 5 |
| `execution-queue-history` | Pending/running/history projection, progress, cancel and result drill-down | Host execution API | Phase 3 |
| `subgraph-navigation` | Convert selection, promoted typed ports, breadcrumb navigation, persistence and execution flattening | graph-organization, workflow-tabs-templates | Phase 4 |
| `state-graph-settings` | DAG/state-graph mode, explicit entries, JSON initial state, reducers, and finite step limit | Versioned Host gateway and state-graph contracts | State-graph extension |
| `state-graph-controls` | Conditional routes, fixed parallel branches, all-input join, bounded loop, state read/update, interrupt and branch end | State-graph scheduler, typed ports | State-graph extension |
| `execution-pause-resume` | Step/state evidence, explicit PAUSED checkpoint, JSON resume value, owner-authorized continuation | Host execution API and persisted frozen definitions | State-graph extension |
| `webhook-binding` | Current-Agent binding, one-time token display, rotation, revocation and truthful availability | Existing Host webServer and authorized Remote | Trigger extension |
| `agent-runtime-lifecycle` | Normal Agent runtime tool and runtime skill; live checks and unload cleanup | Host tools, skills and Agent services | Plugin lifecycle extension |

## Shared contracts

- Graph mutations are transactions. Every user-visible mutation must be undoable and mark the active workflow dirty exactly once.
- Execution nodes remain the only nodes sent to the DSH engine. Visual-only groups and reroutes live in optional workflow UI metadata and are normalized before execution.
- Keybindings do not intercept ordinary typing. Modifier shortcuts may run inside text fields only when they do not replace native edit operations.
- Search and menus are keyboard-operable, focus-managed, and close with Escape.
- Execution state distinguishes pending, running, paused, success, failure, and cancellation. State graphs show steps rather than estimating completion from the number of graph nodes. Status is never conveyed by colour alone.
- Existing workflows without UI metadata remain valid and load unchanged.
- `WorkflowNodeDescriptor.group` is an optional slash-delimited presentation path. Omitting it preserves the legacy five-category fallback and does not change execution semantics.
- Legacy definitions without `execution` remain DAGs; state-graph mode preserves settings through edits and navigation and allows bounded cycles. Returning to DAG mode requires removing cycles.
- Manual, Agent and webhook calls select their matching entry. An Agent may use the manual entry of a legacy workflow when no Agent trigger is declared.
- Webhook input never selects the owner, definition or output directory. Credentials remain ephemeral and are excluded from persisted workflow and skill content.
- Runtime tools and skills disappear with the plugin; source authoring stays preset-scoped. A user-maintained skill file is not proof of current runtime availability.

## Definition of done

- `pnpm check` passes without skipped tests or new type/lint suppressions.
- New graph state primitives have unit tests; key user paths have browser verification.
- The real Vite build is opened in a browser and inspected for console/runtime errors.
- Desktop and compact-window screenshots are captured under `output/playwright/`.

## Current subflow boundary

The v1 editor supports one executable subflow level. Groups and reroutes inside that level persist, and reroutes at promoted-port boundaries flatten correctly for Host execution. Recursive subflow nesting remains intentionally guarded until cycle detection and recursive migration semantics are specified.

## State-graph and ingress boundary

See the [state-graph guide](./STATE_GRAPH_GUIDE.md) for node configuration, LangGraph architectural references, runtime skill ownership, webhook setup and importable examples. The implementation uses native JSON contracts, `replace/append/sum/merge` reducers, and a step limit of at most 1000. Ordinary convergence uses any-input activation; explicit Join waits for every incoming edge.

Only explicit persisted `PAUSED` checkpoints can resume with the frozen workflow and validated owner. The extension does not provide LangGraph API compatibility, dynamic Send tasks, arbitrary RUNNING crash recovery, distributed scheduling, or exactly-once guarantees. Webhooks require the existing Host listener and live binding; their 64 KiB JSON limit and 32-active-execution admission gate do not constitute a durable delivery queue. Schedule, DSH Event and standalone LLM providers remain unavailable.
