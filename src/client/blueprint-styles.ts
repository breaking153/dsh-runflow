/** Graph workbench: one visual owner for nodes, pins and editor chrome. */
export const BLUEPRINT_STYLES = String.raw`
.dsh-runflow-root {
  --rf-accent: #4279cb;
  --rf-accent-hover: #4f88de;
  --rf-accent-foreground: #fff;
  --rf-business: #8bbaff;
  --rf-ink: #e2e7ee;
  --rf-muted: #a1acbd;
  --rf-line: #3a424f;
  --rf-surface: #252b34;
  --rf-surface-raised: #2d3440;
  --rf-canvas: #1b2028;
  --rf-grid: #353d49;
  --rf-focus: #9dc5ff;
  --rf-danger: #f07887;
  --rf-radius: 6px;
  --rf-font: 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif;
  --rf-mono: ui-monospace, 'Cascadia Code', Consolas, monospace;
  background: var(--rf-canvas);
  color: var(--rf-ink);
  color-scheme: dark;
  font: 13px/1.5 var(--rf-font);
}
.dsh-runflow-root ::selection { background: #365b8c; color: #fff; }
.dsh-runflow-root :focus-visible { outline: 2px solid var(--rf-focus); outline-offset: 3px; }
.dsh-runflow-root input, .dsh-runflow-root textarea { caret-color: var(--rf-focus); }
.dsh-runflow-root input::placeholder, .dsh-runflow-root textarea::placeholder { color: var(--rf-muted); opacity: 1; }
.flow-app, .runflow-main { background: var(--rf-canvas); }
.workflow-sidebar { width: 240px; flex-basis: 240px; background: #222832; border-color: var(--rf-line); }
.workflow-sidebar-brand { height: 58px; flex-basis: 58px; padding: 0 16px; }
.workflow-sidebar-brand-copy strong { font-size: 14px; }
.workflow-sidebar-brand-copy small { display: none; }
.workflow-sidebar-logo { width: 30px; height: 30px; background: #365a90; box-shadow: none; border-radius: 6px; }
.workflow-sidebar-nav { gap: 6px; padding: 12px; }
.workflow-sidebar-nav button { height: 36px; font-size: 12px; }
.workflow-sidebar-nav button.active { background: #334052; color: #d2e4ff; }
.workflow-sidebar-nav button em { font-size: 10px; color: var(--rf-muted); background: #222b37; }
.workflow-sidebar-section-head { height: 30px; font-size: 11px; letter-spacing: 0; text-transform: none; }
.workflow-sidebar-quick-actions { margin: 6px 12px; }
.workflow-sidebar-quick-actions button { height: 32px; font-size: 11px; border-color: var(--rf-line); color: var(--rf-muted); background: transparent; }
.workflow-sidebar-quick-actions button.active { color: var(--rf-ink); background: var(--rf-surface-raised); }
.workflow-sidebar-create { height: 34px; margin: 8px 12px 12px; font-size: 12px; border-radius: 5px; background: #344965; border-color: #456184; }
.workflow-sidebar-create:hover { background: #3e5779; border-color: #6486b0; }
.workflow-sidebar-search { height: 34px; margin: 4px 12px 12px; background: #1e242d; border-radius: 5px; }
.workflow-sidebar-search input { font-size: 12px; }
.workflow-sidebar-list { padding: 0 10px 16px; }
.workflow-sidebar-item { min-height: 62px; padding: 10px; border-radius: 5px; }
.workflow-sidebar-item.active { background: #303e52; border-color: #526c8d; box-shadow: none; }
.workflow-sidebar-item-copy strong { font-size: 12px; font-weight: 600; }
.workflow-sidebar-item-copy small { font-size: 10px; }
.workflow-sidebar-item-icon { background: transparent; color: #aacbfa; }
.workflow-sidebar-footer { height: 40px; flex-basis: 40px; padding: 0 14px; }
.workflow-sidebar-host, .workflow-sidebar-host.offline { color: var(--rf-muted); font-size: 11px; }
.workflow-node-tree-item { min-height: 44px; }
.workflow-node-tree-item strong { font-size: 12px; }
.workflow-node-tree-item small, .workflow-node-tree-group>button { font-size: 11px; }
.editor-header { height: 58px; flex: 0 0 58px; gap: 12px; padding: 0 16px; background: #242b35; border-bottom: 1px solid var(--rf-line); }
.editor-title { flex: 1; min-width: 110px; gap: 8px; }
.editor-title input { width: 100%; max-width: 310px; padding: 6px; font-size: 14px; font-weight: 600; color: var(--rf-ink); }
.editor-title>span:nth-child(2) { font-size: 11px; color: var(--rf-muted); }
.back-button { width: 30px; height: 32px; color: var(--rf-muted); }
.autosave-state { min-width: 70px; max-width: 180px; font-size: 10px; }
.autosave-state.error { color: #ffacb5; }
.editor-tabs { align-self: stretch; }
.editor-tabs button { padding: 0 12px; font-size: 12px; }
.editor-tabs button.active { color: #d9e8ff; border-bottom-color: #8bbaff; }
.editor-actions { gap: 6px; }
.icon-text-button, .run-action { height: 32px; min-height: 32px; padding: 0 10px; font-size: 11px; border-radius: 5px; }
.icon-text-button { background: transparent; border-color: var(--rf-line); color: #c0cada; }
.icon-text-button:hover { background: #354050; border-color: #586779; }
.run-action { background: #4279cb; border-color: #4279cb; box-shadow: none; }
.run-action:disabled { opacity: 1; color: #acb6c6; border-color: #414c5d; background: #344154; }
.canvas-column, .flow-canvas { background: var(--rf-canvas); }
.flow-canvas .react-flow__background { opacity: .32; }
.canvas-toolbar { left: 18px; right: 18px; top: 16px; justify-content: flex-start; gap: 10px; }
.canvas-toolbar .add-node-button { height: 34px; padding: 0 12px; font-size: 12px; border: 1px solid #465161; border-radius: 5px; background: #2c3440; color: #dce5f2; box-shadow: none; }
.selection-help { display: none; }
.history-tools, .canvas-tools { height: 34px; gap: 2px; padding: 2px; border: 1px solid #414b5a; border-radius: 5px; background: #282f3a; box-shadow: none; backdrop-filter: none; }
.history-tools button, .canvas-tools button { width: 30px; height: 28px; color: #bac7d9; border-radius: 3px; }
.history-tools button:disabled { opacity: .4; }
.canvas-tools { margin-left: auto; }
.flow-canvas .react-flow__minimap { width: 160px; height: 112px; right: 16px; bottom: 16px; margin: 0; border: 1px solid #424d5c; border-radius: 5px; background: #242d39; box-shadow: none; }
.flow-canvas .react-flow__minimap svg { width: 100%; height: 100%; background: #242d39; }
.react-flow__background-pattern.dots { fill: var(--xy-background-pattern-color-props, #657186); }
.react-flow__minimap-mask { fill: #10151d80; stroke: #7c8ba1; stroke-width: 1; }
.react-flow__minimap-node { fill: var(--xy-minimap-node-background-color-props, #7188a6); stroke: none; }

/* Structural rules are independent of theme and never animate graph coordinates. */
.react-flow__connection { pointer-events: none; }
svg.react-flow__connectionline { z-index: 1001; overflow: visible; position: absolute; pointer-events: none; }
.react-flow__connection-path { fill: none; stroke-linecap: round; }
.react-flow__nodesselection { z-index: 3; transform-origin: left top; pointer-events: none; }
.react-flow__nodesselection-rect { position: absolute; pointer-events: all; cursor: grab; border: 1px dashed #8bbaff; background: #8bbaff0a; }
.react-flow__resize-control { position: absolute; }
.react-flow__resize-control.left, .react-flow__resize-control.right { cursor: ew-resize; }
.react-flow__resize-control.top, .react-flow__resize-control.bottom { cursor: ns-resize; }
.react-flow__resize-control.top.left, .react-flow__resize-control.bottom.right { cursor: nwse-resize; }
.react-flow__resize-control.bottom.left, .react-flow__resize-control.top.right { cursor: nesw-resize; }
.react-flow__resize-control.handle { width: 9px; height: 9px; border: 1px solid #dbeaff; border-radius: 2px; background: #5383bf; translate: -50% -50%; }
.react-flow__resize-control.handle.left { left: 0; top: 50%; }
.react-flow__resize-control.handle.right { left: 100%; top: 50%; }
.react-flow__resize-control.handle.top { left: 50%; top: 0; }
.react-flow__resize-control.handle.bottom { left: 50%; top: 100%; }
.react-flow__resize-control.handle.top.left { left: 0; }
.react-flow__resize-control.handle.bottom.left { left: 0; }
.react-flow__resize-control.handle.top.right, .react-flow__resize-control.handle.bottom.right { left: 100%; }
.react-flow__resize-control.line { border: 0 solid #7caff0; }
.react-flow__resize-control.line.left, .react-flow__resize-control.line.right { width: 1px; height: 100%; top: 0; border-left-width: 1px; translate: -50% 0; }
.react-flow__resize-control.line.left { left: 0; }
.react-flow__resize-control.line.right { left: 100%; }
.react-flow__resize-control.line.top, .react-flow__resize-control.line.bottom { width: 100%; height: 1px; left: 0; border-top-width: 1px; translate: 0 -50%; }
.react-flow__resize-control.line.top { top: 0; }
.react-flow__resize-control.line.bottom { top: 100%; }
.react-flow__node.dragging, .react-flow__nodesselection-rect:active { cursor: grabbing; }
.flow-canvas .react-flow__edge-path { stroke-linecap: round; }
.flow-canvas .react-flow__edge.selected .react-flow__edge-path { stroke: #aad0ff !important; stroke-width: 3; }
.flow-canvas .react-flow__selection { border: 1px solid #8bbaff !important; background: #8bbaff14 !important; box-shadow: none; }

.workflow-node { width: 256px; min-height: 0; padding: 0; color: #e7edf6; background: #292f3a; border: 1px solid #4d5768; border-radius: 7px; box-shadow: 0 5px 12px #0c10164a; overflow: visible; transition: border-color 120ms ease; }
.workflow-node:hover { border-color: #738196; }
.workflow-node.node-kind-pure { width: 220px; }
.node-kind-pure .node-header { min-height: 50px; padding: 8px 12px; }
.node-meta { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
.node-kind { flex: 0 0 auto; color: #d5dfed; font-size: 10px; line-height: 1.4; }
.node-value-preview { display: block; margin: 8px 12px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--rf-ink); font: 12px/1.6 var(--rf-mono); }
.node-value-preview>span, .node-visit-count { color: var(--rf-muted); font: 10px/1.5 var(--rf-font); }
.node-visit-count { margin-right: auto; }
.workflow-node.is-selected { border-color: #9cc7ff; outline: 1px solid #9cc7ff; outline-offset: 1px; }
.react-flow__node.dragging .workflow-node { border-color: #c0dcff; box-shadow: 0 10px 20px #080c1459; transition: none; }
.node-header { display: flex; align-items: center; gap: 10px; min-height: 60px; margin: 0; padding: 12px 14px; border: 0; border-bottom: 1px solid #ffffff0f; border-radius: 6px 6px 0 0; background: color-mix(in srgb, var(--node-color) 18%, #2c3443); }
.node-icon { width: 24px; height: 26px; flex: 0 0 24px; display: grid; place-items: center; border: 0; border-radius: 0; background: transparent; color: color-mix(in srgb, var(--node-color) 68%, white); }
.node-heading { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.node-heading strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; line-height: 1.4; font-weight: 650; color: #f0f4fa; }
.node-type { display: block; margin: 0; padding: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: #b8c7db; font: 10px/1.4 var(--rf-mono); }
.node-status { display: inline-flex; flex-shrink: 0; align-items: center; gap: 4px; padding: 0; border: 0; background: transparent; color: #b5c3d5; font-size: 10px; }
.node-status-dot { display: block; width: 5px; height: 5px; border-radius: 50%; background: #a2b2c6; }
.node-status.status-running, .node-status.status-paused { color: #a7ccff; }
.node-status.status-success { color: #a3d983; }
.node-status.status-failed, .node-status.status-cancelled { color: #ff9aa6; }
.node-port-grid { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); min-height: 0; margin: 0; padding: 12px 0; gap: 14px; border: 0; }
.node-port-grid[data-lane="execution"] { padding: 8px 0; }
.node-port-grid[data-lane="execution"]+.node-port-grid { padding-top: 8px; border-top: 1px solid #ffffff0f; }
.node-kind-pure .node-port-grid { padding: 8px 0; }
.port-column { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
.port-row { position: relative; display: flex; align-items: center; min-width: 0; min-height: 28px; }
.port-button { display: flex; align-items: center; min-width: 0; min-height: 28px; width: 100%; gap: 6px; padding: 3px 16px; color: #dae4f2; border: 0; background: transparent; font: 11px/1.45 var(--rf-font); text-align: left; }
.port-button>span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.port-button em { margin-left: auto; padding: 0; background: transparent; border: 0; border-radius: 0; color: var(--port-color); font: 9px/1.3 var(--rf-mono); text-transform: none; opacity: .95; }
.output-column .port-button { flex-direction: row-reverse; text-align: right; }
.output-column .port-button em { margin-left: 0; margin-right: auto; }
.port-button:hover { background: #ffffff08; color: #fff; }
.port-button:focus-visible { outline-offset: -3px; }
.workflow-node .react-flow__handle { top: 50%; width: 14px; height: 14px; border: 0; border-radius: 0; background: transparent; transform: translateY(-50%); z-index: 5; pointer-events: all; cursor: crosshair; }
.workflow-node .react-flow__handle-left { left: -7px; }
.workflow-node .react-flow__handle-right { right: -7px; }
.workflow-node .react-flow__handle::before { content: ''; position: absolute; top: 1px; left: 1px; width: 12px; height: 12px; border: 2px solid var(--port-color); border-radius: 50%; background: #292f3a; box-shadow: none; pointer-events: none; }
.workflow-node .react-flow__handle::after { content: ''; position: absolute; inset: -7px; pointer-events: all; }
.workflow-node .react-flow__handle:hover { transform: translateY(-50%); background: transparent; box-shadow: none; }
.workflow-node .react-flow__handle:hover::before, .workflow-node .react-flow__handle.connected::before { background: var(--port-color); }
.workflow-node .react-flow__handle.connectingto:not(.valid)::before { border-color: #ff7c8a; background: #ff7c8a; }
.workflow-node .react-flow__handle.flow-pin::before { top: 0; left: 0; width: 14px; height: 14px; border: 0; border-radius: 0; background: var(--port-color); clip-path: polygon(0 0, 62% 0, 100% 50%, 62% 100%, 0 100%); }
.workflow-node .react-flow__handle.flow-pin .pin-core { position: absolute; top: 3px; left: 3px; width: 8px; height: 8px; pointer-events: none; background: #292f3a; clip-path: polygon(0 0, 58% 0, 100% 50%, 58% 100%, 0 100%); }
.workflow-node .react-flow__handle.flow-pin:hover .pin-core, .workflow-node .react-flow__handle.flow-pin.connected .pin-core { background: var(--port-color); }
.node-footer { display: flex; align-items: center; justify-content: flex-end; min-height: 30px; margin: 0; padding: 4px 12px; border-top: 1px solid #414958; }
.node-details-button { display: inline-flex; align-items: center; gap: 5px; padding: 2px 0; border: 0; background: transparent; color: #b6d4fb; font-size: 10px; }
.subflow-node.workflow-node { width: 256px; background: #292f3a; }
.subflow-node.workflow-node>header { background: #33475f; padding: 12px 14px; border-radius: 6px 6px 0 0; color: #e5eefb; }
.subflow-node.workflow-node>header small, .subflow-node.workflow-node>footer { color: #b6c8df; font-size: 10px; }
.workflow-group-node { border-color: #7a8ca6; background: #8bbaff08; }
.workflow-group-title { color: #dce8f7; background: #334156; }
.port-preview { position: absolute; z-index: 80; top: 50%; width: 240px; transform: translateY(-50%); padding: 12px; border: 1px solid #626f82; border-radius: 6px; background: #1e2530; color: #dde8f7; pointer-events: none; box-shadow: 0 8px 20px #070b124d; }
.port-preview.preview-left { right: calc(100% + 18px); }
.port-preview.preview-right { left: calc(100% + 18px); }
.port-preview header { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; }
.port-preview header em { color: var(--port-color); font: 10px var(--rf-mono); }
.port-preview code { display: block; max-height: 90px; overflow: hidden; margin-top: 8px; white-space: pre-wrap; overflow-wrap: anywhere; color: #c1d0e5; font: 11px/1.5 var(--rf-mono); }
.port-preview>span { display: block; margin-top: 8px; color: #a5b3c8; font-size: 10px; }
.react-flow__node.dragging .port-preview, .flow-canvas:has(.react-flow__connection) .port-preview { display: none; }
.connection-feedback { position: absolute; z-index: 40; left: 18px; bottom: 18px; max-width: min(450px,calc(100% - 36px)); padding: 10px 14px; border: 1px solid #66798f; border-radius: 6px; background: #293749; color: #e1edfd; font-size: 12px; pointer-events: none; }
.connection-feedback.is-invalid { color: #ffd2d7; background: #422b35; border-color: #a85a69; }
.connection-feedback.is-valid { color: #cce7be; background: #293d31; border-color: #648769; }

.inspector-wrap { background: var(--rf-surface); border-left: 1px solid var(--rf-line); }
.inspector-wrap.closed { border: 0; }
.contextual-inspector { grid-template-rows: 54px 40px minmax(0,1fr); }
.contextual-inspector-heading { padding: 0 16px; }
.contextual-inspector-heading strong { font-size: 13px; }
.contextual-inspector-heading small { margin-top: 3px; font-size: 10px; }
.contextual-tabs button { font-size: 11px; }
.contextual-tabs button.active { color: #c5dcff; background: #313d4e; }
.contextual-tabs button:disabled { opacity: .55; }
.inspector-scroll { padding: 16px; }
.inspector-node-head { grid-template-columns: 32px minmax(0,1fr) auto; gap: 10px; margin-bottom: 14px; }
.dsh-runflow-root .inspector-node-head strong { font-size: 14px; color: var(--rf-ink); }
.inspector-node-head small { font-size: 10px; color: var(--rf-muted); }
.inspector-node-icon { width: 32px; height: 32px; border: 0; background: transparent; }
.inspector-tabs { margin: 0 -16px; padding: 0 16px; height: 40px; }
.inspector-tabs button { height: 40px; font-size: 11px; }
.form-section { margin-top: 20px; padding-top: 16px; border-color: var(--rf-line); }
.form-section-title { font-size: 11px; letter-spacing: 0; text-transform: none; color: #b7c6d9; margin-bottom: 12px; }
.field { margin-top: 14px; }
.field>span { font-size: 12px; color: #c0cbdc; margin-bottom: 7px; }
.property-field { min-width: 0; }
.property-field-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; margin-bottom: 7px; }
.property-field-heading>label { flex: 1 1 80px; min-width: 0; color: #c0cbdc; font-size: 12px; overflow-wrap: anywhere; }
.property-input-action { display: inline-flex; align-items: center; justify-content: center; flex: 0 1 auto; gap: 5px; min-height: 28px; max-width: 100%; padding: 3px 7px; border: 1px solid var(--rf-line); border-radius: 4px; color: #bdd7fc; background: transparent; font: 10px/1.4 var(--rf-font); cursor: pointer; }
.property-input-action svg { flex: 0 0 auto; }
.property-input-action:hover:not(:disabled) { background: #35465d; border-color: #6486b0; }
.property-input-action.is-promoted { background: #30405a; border-color: #526c8d; color: #d4e6ff; }
.property-input-action:disabled { color: var(--rf-muted); border-style: dashed; cursor: default; }
.property-field-control { min-width: 0; }
.property-field-control input[type="checkbox"] { width: 16px; height: 16px; margin: 4px 0; accent-color: var(--rf-accent); }
.property-field-control .light-code-editor { margin-top: 0; }
.property-input-hint { display: flex; flex-direction: column; gap: 3px; margin-top: 6px; color: var(--rf-muted); font-size: 10px; line-height: 1.5; overflow-wrap: anywhere; }
.property-input-hint>span:first-child:not(:last-child) { color: #bdd7fc; }
.port-button>span>svg { margin-right: 4px; vertical-align: -1px; color: var(--rf-danger); }
.field input, .field select, .field textarea { color: #e2e7ef; background: #1d232d; border: 1px solid #4a5566; border-radius: 5px; font-size: 12px; }
.field input, .field select { height: 36px; }
.field textarea { padding: 10px; font-family: var(--rf-mono); }
.debug-button { color: #b6d4fa; border-color: #4e617d; background: #2e3b4d; }
.debug-button:disabled { opacity: .6; }
.host-capability-warning, .field-error, .page-error, .template-save-error { background: #402c35; border-color: #a85868; color: #ffc1cb; }
.run-settings-popover { background: #252d39; border-color: #52627a; box-shadow: 0 12px 32px #090d1559; }
.run-settings-popover input, .run-settings-popover textarea { background: #1c232e; border-color: #4e5d72; color: #e6edf7; font-size: 12px; }
.run-settings-popover label>span { font-size: 11px; color: #bfcadb; }
.selection-toolbar { background: #293341; color: #dbe6f4; border-color: #5c7190; border-radius: 6px; box-shadow: 0 5px 15px #0a10194d; }
.selection-toolbar button { color: #c6d4e7; font-size: 11px; }
.selection-toolbar strong { color: #dce8fb; font-size: 11px; }
.execution-dock { background: #252e3c; color: #dae5f3; border-color: #576880; backdrop-filter: none; box-shadow: 0 6px 18px #080e184d; }
.execution-summary { color: #dbe7f7; }
.execution-copy span, .execution-duration { color: #a7bbd4; }
.queue-item>button:first-child, .queue-body nav button { color: #bfd0e5; }
.queue-body nav button.active { background: #344863; color: #e2efff; }
.queue-cancel { color: #ffb5bf; border-color: #985968; background: #49303a; }
.queue-item.status-paused>button, .execution-resume>button { color: #bcd7ff; }
.execution-icon { background: #33404f; color: #c6daef; }
.queue-empty { color: #b3c2d6; }
.workspace-page { height: 100%; }
.page-header p { display: none; }
.page-header h1 { font-size: 24px; }
.workflow-row, .workflow-table, .execution-list-row { border-color: var(--rf-line); }
.workflow-avatar { background: #304057; color: #b7d4fc; }
.page-search, .filter-select { color: var(--rf-muted); background: var(--rf-surface); border-color: var(--rf-line); }
.node-search-dialog, .node-search-backdrop, .canvas-context-menu, .command-palette { color: var(--rf-ink); }

@container runflow-shell (max-width: 1200px) {
  .editor-header { gap: 8px; padding-inline: 12px; }
  .editor-tabs button { padding-inline: 8px; }
  .editor-title input { max-width: 240px; }
}
@container runflow-shell (max-width: 1080px) {
  .workflow-sidebar { width: 56px; flex-basis: 56px; }
  .workflow-sidebar-brand { padding: 0; justify-content: center; }
  .workflow-sidebar-nav { padding: 10px 6px; gap: 8px; }
  .workflow-sidebar-nav button { height: 36px; }
  .workflow-sidebar-footer { padding: 0; }
  .editor-actions .icon-text-button { width: 32px !important; }
  .autosave-state { display: none; }
  .canvas-toolbar { left: 14px; right: 14px; top: 14px; }
}
@container runflow-shell (max-width: 720px) {
  .workflow-sidebar { width: 48px; flex-basis: 48px; }
  .workflow-sidebar-nav { padding: 8px 4px; }
  .editor-title { min-width: 0; }
  .editor-title input { width: 100%; max-width: none; font-size: 13px; }
  .editor-header { padding-inline: 8px; gap: 6px; }
  .history-tools button, .canvas-tools button { width: 27px; }
  .flow-canvas .react-flow__minimap { display: none; }
  .port-preview { display: none; }
  .inspector-wrap { width: calc(100% - 16px) !important; max-width: calc(100% - 16px); }
}
@container runflow-shell (max-width: 560px) {
  .editor-header { height: 94px; flex-basis: 94px; }
  .editor-title { flex: 1; }
  .canvas-toolbar { left: 10px; right: 10px; gap: 6px; }
  .canvas-toolbar .add-node-button { width: 32px; height: 32px; padding: 0; font-size: 0; gap: 0; }
  .history-tools, .canvas-tools { height: 32px; }
  .history-tools button, .canvas-tools button { width: 24px; height: 26px; }
  .connection-feedback { left: 10px; bottom: 10px; max-width: calc(100% - 20px); }
}
@media (prefers-reduced-motion: reduce) {
  .workflow-node, .workflow-sidebar-item, .icon-text-button { transition: none; }
}
`
