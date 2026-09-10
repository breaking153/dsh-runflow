<p align="center">
  <img src="./docs/assets/dsh-runflow-logo.svg" width="520" alt="DSH RunFlow Logo" />
</p>

<p align="center">
  Visual DAG and state-graph workflow orchestration integrated with DeepSeek Harness
</p>

<p align="center">
  <a href="./README.md">简体中文</a> · <strong>English</strong>
</p>

DSH RunFlow reuses the Agent, Subagent, LLM Provider, `run_code`, scope, permission, and lifecycle systems already provided by DeepSeek Harness. Visual authoring, node development, execution, and debugging all run inside the same Host. RunFlow is not a second Agent runtime and does not bypass DSH through a standalone HTTP service.

> The current release is `0.1.0` Alpha on Host architecture v2. Existing DAGs remain compatible; optional state graphs add bounded loops, shared-state reducers, and pause/resume. Entry points include manual runs, normal Agents, and authenticated webhooks. Webhooks require the existing Host web service and a live Agent binding. Schedule, DSH Event, and standalone LLM nodes remain unimplemented. See the [state-graph and ingress guide (Chinese)](./docs/STATE_GRAPH_GUIDE.md) for configuration and limits.

## Highlights

- **Native DSH execution**: `dsh.agent` starts child agents through `ctx.subagents.start()` and discovers Provider, Model, and capability data from the active Host.
- **Visual DAG and state-graph authoring**: typed named ports, multiple outputs, conditional routing, parallel joins, shared state, and bounded loops. Definitions without an execution mode keep legacy DAG behavior.
- **Three execution entry points**: UI manual runs, the normal Agent `runflow` tool, and live Agent-authorized webhooks share the Host engine. The owning Agent can resume an explicit pause.
- **Multiple workflows**: manage definitions, triggers, and recent runs from one sidebar; UI changes are persisted immediately.
- **Observable runs**: inspect node status, duration, inputs, outputs, logs, errors, and artifacts through one Details UI.
- **Node development loop**: creation-mode tools and Node Lab support authoring, real execution tests, content-hash versions, hot reload, and test-gated persistence.
- **Isolated runtime data**: workflow, execution, and output files live under `~/.dsh_agent_workflow/`, outside both the DSH checkout and plugin directory.
- **AI review first**: Agent-generated workflows enter Review before manual tuning; diagnostics and stable diffs remain visible, and human changes mark the draft as edited.

## UI and interaction model

### 1. Enter RunFlow from DSH

Hover over **RunFlow** in the DSH sidebar to open a multi-workflow summary showing each Trigger and most recent result. Click the entry to open the floating workspace.

![RunFlow multi-workflow summary in the DSH sidebar](./output/playwright/runflow-host-sidebar-hover.png)

The workspace can be moved, resized, maximized, minimized, and restored. Clicking the normal DSH conversation area closes RunFlow, which keeps switching between chat and workflow work fast.

### 2. Manage multiple workflows

The overview creates, searches, filters, duplicates, and deletes workflows. The left sidebar keeps Trigger and recent-run summaries visible. A workflow created or edited in the UI is written to disk immediately, so running it once does not make it disappear.

![Workflows tab with workflow state](./output/playwright/runflow-workflows-desktop.png)

Basic flow:

1. Select **Create workflow**.
2. Choose the workflow in the sidebar, then edit its name in the header.
3. Changes auto-save to the workflow's own file; RunFlow re-confirms persistence before execution.
4. Open **Executions** to inspect historical runs and per-node results.

### 3. Edit the canvas and add nodes

![Nodes tab with the grouped node library](./output/playwright/comfy-sidebar-nodes.png)

The canvas follows familiar automation-editor interactions while retaining the DSH blue visual language:

- Left-drag on empty space to marquee-select multiple nodes.
- Hold the right mouse button and drag to pan; use the wheel or controls to zoom and fit the view.
- Use the left **Nodes** tab to search or collapse groups, click to insert, or drag a node to an exact canvas position.
- Right-click empty space, or select **Add node**, to open the Node Library.
- Select a node to edit it in the Inspector; duplicate and delete actions live in the Inspector header.
- Drag an input or output port into empty space to list only directionally and type-compatible nodes.
- Hover a port for roughly 500ms to see a bounded preview; click the port or expand action for complete data.

![Visible DSH-blue selection marquee](./output/playwright/comfy-selection-marquee.png)

![Resizable parameter inspector and typed ports](./output/playwright/runflow-editor-desktop.png)

Custom providers can declare their own hierarchy with an optional slash-delimited `group`, such as `Acme Tools/Images`. Omitting it keeps the legacy `category` fallback. Node Lab is reserved for source authoring rather than node discovery.

### 4. Configure a DSH Agent node

The Agent node is not a simulation. It reads the active Host's Subagent Provider and LLM model catalogs, then maps its fields to current DSH Agent and start options.

![Base DSH Agent node configuration](./output/playwright/docs-agent-options.png)

Available controls include:

- Subagent Provider and Child Label;
- `agentOptions.provider`, `model`, `reasoningEffort`, and `maxTokens`;
- `maxDepth`, `outputSchema`, `toolFilter.allow/deny`, and `persona`;
- node retry and timeout, workflow input, and workflow output directory.

<details>
<summary>Show Child capabilities and Tool Filter configuration</summary>

![AgentOptions and Child capabilities](./output/playwright/docs-agent-capabilities.png)

</details>

The Host validates every requested capability before execution. Unsupported output schemas, depth limits, tool filters, or personas fail explicitly instead of being silently ignored. Empty AgentOptions inherit from the Provider or parent Agent.

### 5. Run, debug, and inspect results

When connected to the DSH Host, **Execute workflow** calls a Typert Remote authorized for the current primary Agent. The Host returns an execution ID immediately and the UI polls that execution. Normal Agents can also run existing workflows with `runflow`. Webhooks use the existing Host HTTP service, a live binding, and Bearer authentication; external input cannot select the Agent, definition, or output directory. Cross-Agent execution reads, cancellation, and resume are rejected.

![Node execution Details UI](./output/playwright/host-integrated-creation-run-code.png)

Node Details exposes five views: **Overview, Input, Output, Logs, and Files**. Failed nodes prioritize structured error information, while Files lists final artifacts and `intermediate/` debug output. Details can be opened from a node card, a port preview, or a node row in execution history.

**Run settings** exposes the execution mode, step limit, entry nodes, initial state, and reducers. State graphs report steps and state; `PAUSED` means an explicit JSON response is required, not failure or completion. Resuming `control.interrupt` uses the same frozen workflow definition. Arbitrary `RUNNING` executions are not automatically recovered after a crash. See the [guide](./docs/STATE_GRAPH_GUIDE.md) for configuration and examples.

> The standalone `pnpm dev` page is only a layout and interaction preview. Without a DSH Host it shows **Host disconnected**, disables real execution, and never synthesizes mock results.

### 6. Develop nodes and scripts in Node Lab

The **Nodes** tab exposes **Node Lab** in its footer. In creation mode it reads the Host source library under `nodes/` and `script/`, shows a content-hash revision after save, and schedules a serial hot reload.

- The lightweight editor supports line numbers, Tab indentation, `Ctrl+Space`, and dot-triggered basic completion.
- Completion covers `ctx.flow`, `ctx.flowScript`, `ctx.agents`, `ctx.llm`, `ctx.tools`, `execution.node.config`, logs, and intermediate artifacts.
- For larger refactors, use `defineRunFlowNodePlugin()` / `defineRunFlowScriptPlugin()` in WebStorm for complete TypeScript inference.

## Install and run the first workflow

RunFlow requires Node.js `^22.19.0` or `>=24.0.0` and DeepSeek Harness `0.1.2-alpha.2`, matching the current peer dependencies.

### Local link installation

Start in the `dsh-flow` repository root, with the `deepseek-harness` repository in the same parent directory. Build the plugin first:

```powershell
pnpm install
pnpm build
```

Then add it to the DSH Web profile from the DeepSeek Harness repository:

```powershell
cd ../deepseek-harness
pnpm dsh plugin --profile web add "link:../dsh-flow"
```

Restart the Web profile. **RunFlow** will appear in the DSH sidebar. The bundle injects this default configuration:

```yaml
- insert:
    - id: dsh-runflow
      name: dsh-runflow
      config:
        maxParallelNodes: 4
        defaultTimeoutMs: 30000
        watchFiles: true
        enableAuthoringTools: true
        authoringPresetId: cordis
```

For a first real run, create a workflow, connect `Manual Trigger → JavaScript → Storage`, save it, select **Execute workflow**, and open the resulting node Details from **Executions**.

## DeepSeek Harness architecture

```mermaid
flowchart LR
  UI[DSH Web / RunFlow UI] -->|Typert Remote + current agentId| REMOTE[RunFlow Remote]
  REMOTE --> FLOW[ctx.flow / DAG + State Graph Engine]
  AGENT[Normal Agent / runflow tool] --> FLOW
  WEB[Host Web Server] -->|Bearer + live Agent binding| FLOW
  FLOW --> SNAPSHOT[Node Provider snapshot]
  SNAPSHOT --> NODE[Built-in and file-backed nodes]
  NODE --> SUB[ctx.subagents.start]
  NODE --> CODE[ctx.flowScript / run_code]
  NODE --> HOST[Trusted Cordis ctx services]
  FLOW --> DATA[~/.dsh_agent_workflow/data]
  FLOW --> OUTPUT[~/.dsh_agent_workflow/output]
  WATCH[nodes/ and script/ watchers] -->|SHA-256 version + serial reload| SNAPSHOT
```

Important boundaries:

- RunFlow captures a Node Provider snapshot at each start or resume. That execution segment keeps the same Providers even if source files change while it is active. Resume uses the frozen workflow definition with currently available Providers.
- The `nodes/` and `script/` loaders use a `tsc --watch`-style single-flight queue: file events are coalesced, versions are SHA-256 content hashes, and the old Cordis fiber is disposed before the new version activates.
- If a new version cannot import or activate, the loader attempts to restore the previous version. Later file changes continue to trigger reloads.
- The UI Remote is scoped to the active primary Agent. Single-node debugging executes the target and all of its upstream dependencies, not a fake canvas-order subset.

## Creation mode and AI authoring

While the plugin is active, normal live Agents receive the runtime `runflow` tool with `capabilities/list/get/start/get_execution/list_executions/cancel/resume`. It operates on saved workflows and grants no authoring rights. The runtime `dsh-runflow` skill guides capability discovery. Unloading unregisters the tool and skill, and cached calls recheck live service availability. User-maintained skill files are left intact.

Authoring capabilities are injected only into the default `cordis` creation-mode scope. Normal conversations and other presets cannot see them:

| Tool / Skill | Purpose |
| --- | --- |
| `runflow_node` | Node Provider `list/get/create/update/delete_draft/test/commit/delete_persisted` |
| `runflow_workflow` | Workflow CRUD, node-instance CRUD, and `run/get_execution/list_executions/cancel` |
| `dsh-runflow-node-development` | Guides an Agent through author → test → revise → persist |
| `run_code` | Enabled only in that preset scope when creation mode has no Code transport |

The node development loop is deliberately test-gated:

1. Use `runflow_node(list/get)` to inspect existing Providers and avoid replacing built-in or plugin nodes.
2. `create` or `update` writes `nodes/.drafts/<type>.node.json` and hot-loads the draft into memory.
3. `test` creates a single-node workflow and executes it in the real RunFlow engine through the current Agent's `run_code`.
4. Inspect `outputPorts`, `logs`, `error`, `outputDir`, and `artifacts`; every content change creates a new revision that must be tested again.
5. `commit` atomically writes `nodes/<type>.node.json` only when the current content-hash revision has a `SUCCESS` test.

Set `enableAuthoringTools: false` to disable authoring completely, or point `authoringPresetId` to another explicit creation preset.

## Author hot-reloadable Node and Script plugins

Both `*.node.ts` and `*.script.ts` files are trusted Cordis child plugins. They receive the real Host `ctx` and complete TypeScript/WebStorm inference:

```ts
import { defineRunFlowNodePlugin } from 'dsh-runflow'

export default defineRunFlowNodePlugin({
  inject: ['llm'],
  node: {
    type: 'example.transform',
    title: 'Transform',
    description: 'Transform incoming JSON',
    category: 'data',
    group: 'Example/Data transforms',
    color: '#4A5FA8',
    icon: 'braces',
    inputs: [{ id: 'source', type: 'json', required: true }],
    outputs: [{ id: 'result', type: 'json' }],
  },
  async execute(ctx, execution) {
    execution.signal.throwIfAborted()
    execution.log('transform started')
    await execution.writeIntermediate('normalized-input', execution.inputs.source ?? null)
    return execution.inputs.source ?? null
  },
})
```

A normal single-output node can directly `return value`. Multiple outputs require an explicit envelope so ordinary business objects are never mistaken for port maps:

```ts
return {
  $runflow: 'port-outputs',
  outputs: {
    records: [{ id: 1 }],
    summary: '1 record',
  },
}
```

Bundled executable examples include:

- `demo.context-probe` for live Agent / Provider context;
- `demo.multi-output` for typed multiple outputs and intermediate artifacts;
- `demo.run-code-channel` for asynchronous DSH `run_code` channel waits;
- `agent.generated-normalizer` and `agent.generated-ctx-script` for source API and hot-reload integration tests.

## Script Channel

`script.javascript` never uses `eval`. It submits code to the DSH `run_code` transport visible to the current Agent, preserving approval, audit, tool-policy, and cancellation behavior.

`ctx.flowScript.submit()` returns `{ requestId, result }`; callers can also await `ctx.flowScript.wait(requestId, signal)`:

```text
queued → running → success | error | cancelled
```

Terminal results include `value`, `logs`, structured `error`, queue/execution timing, `transport: run_code`, language, and agentId. Cancelling a waiter does not cancel the underlying request; the submitting request's `AbortSignal` owns that task.

## Typed ports and multiple outputs

- Supported types: `any/flow/json/text/number/boolean/file/files/image/audio/table/error`. Trigger `flow` signals carry business input; state control nodes can read their payload.
- Edges route through `sourcePort` / `targetPort`; validation checks port existence, type compatibility, and connection cardinality before execution.
- Legacy nodes without port declarations continue to use compatible `any input/output` ports.
- Every named output has its own preview and Details entry, which fits naturally multi-result HTTP, condition, Agent, and collection nodes.

RunFlow intentionally uses a lightweight “static port descriptor + runtime JSON value” model. It does not yet adopt ComfyUI-style dynamic ports, implicit conversion, widget-as-input, lazy evaluation, or binary object storage. This keeps protocol, migration, and debugging cost controlled while leaving room for evidence-driven extensions.

## Data and output layout

Runtime-owned state is isolated from the DSH checkout and plugin installation:

```text
~/.dsh_agent_workflow/
├─ data/
│  ├─ workflows/
│  │  └─ <workflow-id>-<hash>.workflow.json
│  └─ executions/
│     └─ <execution-id>-<hash>.execution.json
└─ output/
```

Output directory precedence is: one-off `run/test.outputDir` → workflow `outputDir` → plugin `outputDir` → `~/.dsh_agent_workflow/output`.

Each execution receives an isolated directory:

```text
<base>/<workflow-id>/<timestamp>-<execution-id>/
├─ workflow.json
├─ execution.json
├─ nodes/
│  └─ <node-id>/
│     ├─ input.json
│     ├─ input-ports.json
│     ├─ output.json
│     ├─ logs.json
│     └─ error.json
└─ intermediate/
   └─ <node-id>/
      └─ 001-<label>.json
```

Backend v2 no longer maintains `workspace.json` and intentionally provides no migration for development-state data. Each workflow and execution has one authoritative file written with a temporary file plus atomic rename. Explicit `storageDir`, `workflowsDir`, `executionsDir`, and `outputDir` values are always respected.

## Configuration

| Option | Default | Description |
| --- | --- | --- |
| `maxParallelNodes` | `4` | Maximum runnable nodes per batch, from 1 to 64 |
| `defaultTimeoutMs` | `30000` | Default node timeout, from 100 to 3,600,000ms |
| `outputDir` | `~/.dsh_agent_workflow/output` | Default execution output root |
| `storageDir` | `~/.dsh_agent_workflow/data` | Parent directory for v2 repositories |
| `workflowsDir` | `<storageDir>/workflows` | File-backed workflow directory |
| `executionsDir` | `<storageDir>/executions` | File-backed execution history directory |
| `nodesDir` | `<plugin>/nodes` | Node Provider and draft directory |
| `scriptsDir` | `<plugin>/script` | Script Provider directory |
| `watchFiles` | `true` | Watch workflow, Node, and Script files |
| `enableAuthoringTools` | `true` | Install creation-mode tools and skill |
| `authoringPresetId` | `cordis` | Preset scope that receives authoring capabilities |
| `enableWebhooks` | `true` | Register ingress when the existing Host `webServer` is available; each workflow still needs a live binding |
| `apiPrefix` | `/api/runflow` | Host path prefix; bindings use `<apiPrefix>/webhooks/<binding-id>` |

State-graph settings belong to the workflow's `execution` object: `mode: "state-graph"`, `entryNodeIds`, `initialState`, `reducers`, and `maxSteps` (default 100, range 1–1000). These are not plugin options. Webhook credentials and live bindings are not stored in workflow files.

## Capability status

| Node | Status | Implementation |
| --- | --- | --- |
| `trigger.manual` | Executable | Manual Host entry for DAGs and state graphs |
| `trigger.agent` | Executable | Runtime-tool entry for the current live Agent |
| `control.branch` / `control.switch` | State-graph executable | One conditional route, or up to four ordered rules plus a default route |
| `control.parallel` / `control.join` | State-graph executable | Fixed parallel branches; Join awaits a fresh message on every incoming edge |
| `control.loop` | State-graph executable | Condition and iteration bound, also subject to the graph step limit |
| `state.read` / `state.update` | State-graph executable | Shared JSON state with replace / append / sum / merge reducers |
| `control.interrupt` / `control.end` | State-graph executable | Persisted pause and authorized resume; finish the current branch |
| `builtin.condition` | Executable | Conditional routing |
| `builtin.set` | Executable | Field mapping and transformation |
| `builtin.switch` | Executable | Named match/fallback multi-output routing |
| `builtin.sort` | Executable | Sort JSON arrays by nested fields |
| `builtin.aggregate` | Executable | count / sum / average / min / max |
| `builtin.json-parse` / `builtin.json-stringify` | Executable | Typed text/JSON conversion |
| `builtin.wait` / `builtin.stop-error` | Executable | Cancellable wait and explicit failure |
| `dsh.agent` | Executable | `ctx.subagents.start()` with dynamic Provider / Model |
| `script.javascript` | Executable | `ctx.flowScript` → DSH `run_code` |
| `http.request` | Executable | Host `fetch()` with method, headers, and JSON/string body |
| `storage.write` | Executable | Persists into the execution's `intermediate/` and returns a receipt |
| `trigger.webhook` | Conditionally available | Host web service, live Agent binding, POST JSON, and Bearer authentication |
| `trigger.schedule` | Not implemented | Waiting for a Host scheduler provider |
| `trigger.dsh-event` | Not implemented | Waiting for a DSH event listener provider |
| `dsh.llm` | Not implemented | Use the fully permission-integrated `dsh.agent` for AI work |

## Development and verification

```powershell
pnpm install
pnpm dev       # standalone UI preview; no Host connection
pnpm check     # typecheck + tests + Host/client build
```

Build outputs:

- `lib/index.js`: DSH Host / Cordis plugin;
- `lib/client.js`: DSH Web client;
- `preview-dist/`: standalone UI preview.

Key directories:

```text
nodes/                  Node executor, drafts, persisted Providers, Host Node plugins
script/                 Script executor, run_code channel, Host Script plugins
src/authoring-tools.ts  Creation-mode scoped tools and skill
src/runtime-tools.ts    Normal Agent run, inspect, cancel, and resume tools
src/runtime-skills.ts   Plugin-owned runtime guidance
src/webhook-ingress.ts  Authenticated ingress on the existing Host HTTP service
src/directory-plugin-loader.ts  Content hashing and serial hot reload
src/engine.ts           Typed-port validation, DAG, retry / timeout / cancel
src/state-graph.ts      Step scheduling, reducers, checkpoints, and pause/resume
examples/workflows/    Bounded loop, parallel reduction, and webhook review examples
src/flow-service.ts     v2 application facade, execution coordination, Provider snapshot
src/backend/v2/         Workflow/Execution repositories and DSH Agent adapter
src/remote-service.ts   Agent-authorized start / poll / cancel Remote
src/client/             Floating workspace, canvas, Inspector, Details UI
```

## Brand assets

The central play node represents execution. The branching traces represent DAG routing, multiple outputs, and Agent delegation. The primary colors follow the DSH blue family, with cyan endpoints highlighting observable outputs.

- Full logo: [`docs/assets/dsh-runflow-logo.svg`](./docs/assets/dsh-runflow-logo.svg)
- Mark: [`docs/assets/dsh-runflow-mark.svg`](./docs/assets/dsh-runflow-mark.svg)
- Favicon: [`public/favicon.svg`](./public/favicon.svg)
- Visual system: [`design-system/dsh-runflow/MASTER.md`](./design-system/dsh-runflow/MASTER.md)

## License

MIT
