# RunFlow Frontend v2 Design

## Status

Approved by the user's instruction to adopt the system-recommended architecture without additional selection questions. Frontend v2 is implemented before backend v2.

## Objective

Rebuild the frontend around the dominant journey: an AI Agent produces a workflow draft, the user reviews the differences and diagnostics, makes focused parameter or graph edits, then runs the real Host workflow and inspects evidence. Preserve current graph-editing capabilities and DSH visual identity while eliminating cross-feature state coupling.

## Decision

Use a composed Zustand application store with four focused slices and a versioned gateway boundary. Keep React Flow and the existing pure graph helpers. Do not introduce an event bus, router, form framework, or new component library.

Alternatives rejected:

- Component-only cleanup leaves persistence, execution, selection, and overlays coupled in one store.
- Independent stores plus an event bus create synchronization and transaction problems that do not serve the current single-editor product.

## Information Architecture

The workspace has five stable regions:

1. A compact left rail switches between Workflows and Nodes and remains independently scrollable.
2. A compact editor header owns workflow identity, save state, navigation, and the primary Run action.
3. The canvas owns graph manipulation only. Context menus, command palette, zoom, minimap, selection, and connection creation remain canvas concerns.
4. A resizable contextual inspector owns Review, Parameters, and Execution evidence. It never displays generic output for a node that has not run.
5. A collapsible execution dock owns live run progress and history selection.

The default inspector tab is Review when an AI draft is pending, Parameters when a node is selected, and Execution only when an execution or node result is selected.

## AI Review Model

`WorkflowReviewSession` is frontend application state, not graph metadata. It contains an origin (`agent`, `user`, or `import`), base and candidate revisions, status, diagnostics, and stable change entries. Change entries describe workflow metadata, node additions/removals/configuration changes, and edge additions/removals.

The user can accept the complete draft, dismiss review after inspection, or edit the graph. The first user edit changes the review status to `edited`; it does not discard the AI provenance or diagnostics. Accepting a review records the action locally and saves the current candidate. Backend v2 may later persist review sessions through the reserved gateway methods.

## Frontend State Boundaries

- Workspace slice: workflow summaries, node catalog, capabilities, Host status, open tabs, and workspace refresh.
- Editor slice: current workflow draft, graph history, clipboard, selection, groups, reroutes, subflows, dirty state, and autosave intent.
- Review slice: AI provenance, graph diff, diagnostics, acceptance state, and inspector routing.
- Execution slice: run input, active execution, history, polling, cancellation, and evidence selection.

The exported `useFlowStore` remains the compatibility facade during the frontend refactor. Slice creators and pure selectors become the implementation authority.

## Host Gateway v2 Boundary

Frontend features depend on `RunFlowGatewayV2`, not Cordis or Typert types. The gateway exposes:

- `workspace.read(context)`
- `workflows.save/delete(context, ...)`
- `executions.start/read/cancel(context, ...)`
- `sources.list/save(context, ...)`
- reserved `reviews.read/accept(context, ...)`

Every call receives an explicit `RunFlowClientContext` containing the current main Agent id. The DSH Remote adapter maps these calls to the Host v2 namespace. Offline behavior is explicit and never represented as a successful preview execution.

## Data Flow

Workspace refresh loads workflows, executions, capabilities, providers, and nodes through the gateway. Opening a workflow creates an editor session from an immutable definition. AI candidates enter through `stageWorkflowReview`; the review diff is derived from the base definition and candidate. Graph commands modify only the editor slice, mark an active review as edited, and enqueue debounced autosave. Runs save first, start through the gateway, and poll until a terminal execution state updates graph evidence.

## Error Handling

Workspace, save, review, and run failures have separate state channels. Errors appear beside the action that failed and use `role="alert"`. A failed save never clears dirty state. A failed refresh never overwrites an active editor. A stale AI candidate is rejected when its base revision no longer matches the open workflow unless the caller explicitly stages it as an import.

## Responsive and Accessibility Rules

At 1024 pixels and above, rail, canvas, and inspector may coexist. Below 1024, the inspector becomes a fixed overlay with a backdrop; below 768, the left rail also becomes a drawer. Resizers expose keyboard-adjustable separators. Icon-only controls have accessible names, overlays restore focus, and animations are 150–220 ms with a reduced-motion override.

## Performance Rules

Subscribe to narrow Zustand selectors. Keep transient pointer geometry in refs or React Flow. Memoize graph nodes and expensive derived review lists. Do not import icon barrels beyond the existing Lucide direct package usage. Load source editing and template surfaces only while open when bundle splitting can be added without changing Cordis client packaging.

## Testing and Acceptance

- Pure tests cover gateway adaptation, diff classification, stale review rejection, slice transitions, and selectors.
- Component tests cover inspector routing, review acceptance, keyboard resizer behavior, contextual execution evidence, and accessible errors.
- Existing graph editing, responsive, Host Remote, persistence, and execution tests remain green.
- Browser verification captures 1440, 1024, 768, and 375 pixel layouts. The final response includes the screenshots requested by the user.

## Backend v2 Handoff

Backend v2 implements the gateway contract directly and removes `publish`, workspace duplication, and compatibility fields. Workflow and execution repositories use independent files without migration because the project is still in development.
