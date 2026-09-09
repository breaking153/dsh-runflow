# Active implementation checklist

## Phase 1

- [x] Write failing tests for snapshot history, clipboard remapping, and shortcut guards.
- [x] Implement graph history primitives.
- [x] Add transaction actions to the store.
- [x] Add command registry, editable keybindings, and reset controls.
- [x] Add command palette and selection toolbar.
- [x] Add pane/node/selection context menus.
- [x] Run focused tests, `pnpm check`, and browser verification.
- [x] Capture desktop and compact-window screenshots.

## Phase 2

- [x] Write node search ranking/navigation tests.
- [x] Rebuild node browser and node library.
- [x] Add workflow UI metadata contract.
- [x] Add groups and reroutes.
- [x] Add canvas display settings.
- [x] Verify persistence, execution normalization, and browser flows.

## Phase 3

- [x] Add workflow tab state and tests.
- [x] Add fragment template persistence and tests.
- [x] Rework execution queue/history projection.
- [x] Verify Host execution contracts and browser flows (the screenshot session had no connected Host).

## Phase 4

- [x] Specify the versioned v1 subflow contract and backwards-compatible optional UI metadata.
- [x] Add conversion, promoted-port, navigation, flattening, persistence, and reroute-boundary tests.
- [x] Implement the one-level executable subgraph editor flow.
- [x] Verify flattened Host definitions and backwards compatibility.
- [ ] Add recursive subflow nesting after cycle detection and recursive migration semantics are specified.

## Phase 5

- [x] Record sidebar ownership, custom group paths, and marquee behaviour in the accepted interaction specification.
- [x] Add tests for node group normalization/tree construction and persisted descriptor validation.
- [x] Implement Workflows/Nodes sidebar tabs, nested node groups, and drag-to-canvas insertion.
- [x] Remove duplicate workflow navigation and move Node Lab behind the Nodes authoring action.
- [x] Add visible primary-button selection marquee styling.
- [x] Run focused tests, `pnpm check`, real-browser interaction verification, and capture screenshots.
