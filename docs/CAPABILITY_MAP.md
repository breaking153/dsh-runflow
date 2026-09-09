# DSH RunFlow Web Capability Map

Status: approved on 2026-09-01. Behaviour reference: ComfyUI Frontend v1.51.9 (`71d2f2f2b5c6da9dee281836b5b72f3af368966f`). The reference is used to understand interaction behaviour only; RunFlow keeps its own React implementation and DSH visual language.

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

## Shared contracts

- Graph mutations are transactions. Every user-visible mutation must be undoable and mark the active workflow dirty exactly once.
- Execution nodes remain the only nodes sent to the DSH engine. Visual-only groups and reroutes live in optional workflow UI metadata and are normalized before execution.
- Keybindings do not intercept ordinary typing. Modifier shortcuts may run inside text fields only when they do not replace native edit operations.
- Search and menus are keyboard-operable, focus-managed, and close with Escape.
- Queue state distinguishes pending, running, success, failure, and cancellation. Status is never conveyed by colour alone.
- Existing workflows without UI metadata remain valid and load unchanged.
- `WorkflowNodeDescriptor.group` is an optional slash-delimited presentation path. Omitting it preserves the legacy five-category fallback and does not change execution semantics.

## Definition of done

- `pnpm check` passes without skipped tests or new type/lint suppressions.
- New graph state primitives have unit tests; key user paths have browser verification.
- The real Vite build is opened in a browser and inspected for console/runtime errors.
- Desktop and compact-window screenshots are captured under `output/playwright/`.

## Current subflow boundary

The v1 editor supports one executable subflow level. Groups and reroutes inside that level persist, and reroutes at promoted-port boundaries flatten correctly for Host execution. Recursive subflow nesting remains intentionally guarded until cycle detection and recursive migration semantics are specified.
