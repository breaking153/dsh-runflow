# ComfyUI-derived interaction model

## Intent

Make DSH RunFlow feel like a mature node editor while preserving DSH-specific execution, typed ports, Agent configuration, source hot reload, and blue visual identity.

## Primary user flows

### Discover and insert a node

The left sidebar has first-class `Workflows` and `Nodes` tabs. `Nodes` exposes a searchable, collapsible category tree and supports click-to-insert and drag-to-canvas. The user can also double-click or right-click an empty canvas, drag a connection into empty space, or use the add-node command. The node browser opens at the relevant point, provides fuzzy search and category navigation, and filters by a dragged port's compatible type. Arrow keys move the active result, Enter inserts it, and Escape cancels. A connected insertion completes the edge automatically.

Node providers may declare an optional slash-delimited `group` path, for example `DSH/Agents/Research` or `Acme Tools/Images`. The sidebar derives its nested tree from that path. Nodes without a group remain backwards compatible and use a stable category fallback. Node Lab remains the source authoring and hot-reload surface; it is not the node discovery library.

### Edit safely

Graph changes are transaction boundaries. Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z navigate history. Copy stores selected execution nodes and their internal edges; paste assigns new IDs, offsets positions, selects the pasted graph, and never copies runtime execution records. Delete, duplicate, group, reroute insertion, and property updates use the same transaction model.

### Organize a graph

Ctrl/Cmd+G groups the current selection. A group is a visual container and does not enter the executable DAG. Moving the group moves its children; selecting a group may select children, while modifier-click can change only the group selection. Reroutes redirect edges visually without becoming execution steps.

### Work across workflows

The sidebar `Workflows` tab is the canonical workflow switcher and shows trigger and latest-run status. Opening a workflow activates it there; the canvas does not repeat workflow navigation in a horizontal tab strip. Dirty state remains visible in the editor header and autosave remains active. Templates are persisted workflow fragments that insert as one undoable transaction. A selection can later be converted to an executable subflow with promoted typed inputs/outputs.

### Select visibly

Dragging with the primary pointer on an empty canvas shows an immediate DSH-blue translucent marquee with a high-contrast outline. The rectangle remains visible throughout the gesture and partial overlap selects nodes. Space + drag and middle-button drag remain canvas pan gestures.

### Observe execution

Queue and history are projections of DSH Host executions. A dock shows pending/running jobs and progress; history provides status, duration, trigger, output directory, error, node results, and a load-definition action. Cancelling affects only an active Host execution.

## Acceptance scenarios

1. Select two nodes, move them, undo once, and observe both return together; redo reapplies the movement.
2. Copy a connected selection and paste it; new node/edge IDs are unique and the pasted nodes are offset and selected.
3. Type inside a configuration field and press an unmodified shortcut key; the field receives the text and no editor command fires.
4. Right-click the canvas, open node search, filter by text/category, navigate with arrows, insert with Enter, then undo the insertion.
5. Drop a typed connection on empty canvas; only compatible nodes are offered and insertion connects the correct slot.
6. Group selected nodes, move the group, save/reload, and confirm the group geometry persists while execution still receives only real nodes.
7. Toggle links and minimap independently; both settings persist for the workflow.
8. Open multiple workflows, switch tabs, and retain each draft and viewport.
9. Pending/running/history states render distinctly with text and icons; opening a failed run exposes the node error and artifacts.
10. Convert a selection to a subflow, promote boundary ports, enter via breadcrumb, edit, save, return, and execute the flattened graph.
11. Switch between `Workflows` and `Nodes` in the left sidebar; workflow switching and node discovery do not duplicate navigation above the canvas.
12. Search a node in the sidebar, drag it to a precise canvas location, and observe one selected node inserted as one undoable transaction.
13. Register custom nodes with `group: "Acme Tools/Images"`; the sidebar renders a nested Acme Tools / Images group instead of placing them in Node Lab or a single generic bucket.
14. Drag across empty canvas with the primary pointer and see a blue marquee before pointer-up; partially intersected nodes become selected.

## Non-goals

- Pixel-for-pixel ComfyUI appearance.
- ComfyUI media/model/asset/extension/cloud modules.
- Loading or executing ComfyUI workflow JSON directly.
