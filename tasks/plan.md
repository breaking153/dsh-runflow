# RunFlow frontend refactor plan

## Phase 1 — editor foundation

1. Add graph snapshots and transaction history to the Zustand store.
2. Add command definitions and keyboard routing with editable-target guards.
3. Implement undo/redo, clipboard, duplicate, delete, select-all, and selection toolbar.
4. Replace ad-hoc pane interactions with accessible context menus and a command palette.
5. Verify unit tests, build, and core browser flows.

## Phase 2 — discovery and organization

1. Rebuild node search with fuzzy ranking, categories, recent items, port filters, and full keyboard navigation.
2. Add visual groups and native selection semantics.
3. Add reroute points, edge actions, link visibility, minimap toggle, and viewport controls.
4. Persist optional workflow UI metadata without changing execution semantics.

## Phase 3 — multi-workflow and operations

1. Add open-workflow tabs with dirty state and viewport restoration.
2. Add reusable workflow-fragment templates.
3. Split execution data into pending, running, and history projections with progress and cancellation actions.
4. Add load-definition and result-detail actions to execution history.

## Phase 4 — executable subflows

1. Define versioned subflow and promoted-port contracts.
2. Convert a selection to a subflow without losing edge/type information.
3. Add subflow editor navigation and breadcrumbs.
4. Flatten subflows into a provider-snapshot DAG before Host execution.
5. Add backwards-compatibility, duplicate-ID, promoted-port, and reroute-boundary tests; schedule recursive nesting behind explicit cycle semantics.

## Phase 5 — ComfyUI-derived sidebar and selection feedback

1. Consolidate workflow switching into the left `Workflows` tab and remove the duplicate canvas-level workflow strip.
2. Add a persistent `Nodes` tab with search, nested provider-defined groups, click insertion, and drag-to-canvas placement.
3. Extend node descriptors with a backwards-compatible slash-delimited group path and validate persisted custom nodes.
4. Make the primary-button selection marquee visible and accessible in the DSH blue visual language.
5. Verify contracts, browser interactions, runtime console state, and desktop screenshots.

## Verification cadence

Each phase ends with `pnpm check`, real-browser keyboard and pointer flows, console/network inspection, and updated screenshots. Phase 4 additionally requires engine contract and persistence migration coverage.
