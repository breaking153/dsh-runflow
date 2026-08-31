# dsh-runflow

`dsh-runflow` 是深度融合 DeepSeek Harness / Cordis 的可视化 DAG Workflow 插件。它复用 DSH 的 Agent、Subagent、LLM Provider、`run_code`、scope 和生命周期能力，不再维护第二套 Agent Runtime。

## 已实现能力

- 可拖拽/缩放的 React Flow 浮动工作台：点击 DSH 区域自动关闭，支持 Inspector、执行 Dock 与节点 Details UI。
- DSH 原生 Agent 节点：动态读取 Subagent Provider 与 LLM Provider/Model，调用 `ctx.subagents.start()`。
- 创造模式专属工具与 Skill：仅注入默认 `cordis`（创造模式）scope，普通会话和其他 preset 不可见。
- 节点开发闭环：创建/修改立即写入 `nodes/.drafts/` → 真实 RunFlow 执行测试 → 当前 revision 通过后固化到 `nodes/`。
- Workflow 文件源：UI、Remote 与 AI 工具保存后立即写入 `~/.dsh_agent_workflow/data/workflows/*.workflow.json`，执行前再次确认持久化。
- JavaScript 节点：通过 DSH `run_code` 执行，不使用 `eval`，保留审批、审计、工具策略和取消链路。
- 类型化命名端口与多输出：执行前校验端口、类型和单/多连接基数。
- 可观测输出：每次执行独立目录，最终输入/输出与日志放在 `nodes/`，脚本/节点中间结果放在 `intermediate/`。

## 创造模式中的 RunFlow

安装插件后，在 `cordis` preset 内会出现：

- `runflow_node`：节点 Provider 的 `list/get/create/update/delete_draft/test/commit/delete_persisted`。
- `runflow_workflow`：Workflow 的 `list/get/save/delete`，节点实例的 `add_node/update_node/delete_node`，以及 `run/get_execution/list_executions/cancel`。
- `dsh-runflow-node-development` Skill：告诉创造模式按安全的节点开发顺序工作。
- `run_code`：当创造模式原本没有 Code transport 时，RunFlow 在该 preset scope 内使用 `both` 展示模式；不会污染其他 preset。

默认注入配置：

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

可以用 `enableAuthoringTools: false` 完全关闭作者工具，或用 `authoringPresetId` 指向其他明确的创作 preset。

## 节点开发与固化

推荐流程：

1. `runflow_node(list/get)` 检查现有节点，避免覆盖 builtin/plugin Provider。
2. `create` 或 `update` 立即写入可执行的 `nodes/.drafts/<type>.node.json`，Node executor 会热加载它。
3. `test` 创建一个单节点 Workflow，在真实 RunFlow Engine 中执行；程序由当前 DSH Agent scope 的 `run_code` 运行。
4. 查看 execution 的 `outputPorts`、`logs`、`error`、`outputDir` 与 `artifacts`；修改后必须重新测试新 revision。
5. 仅当当前 revision 的测试状态为 `SUCCESS` 时，`commit` 才会原子写入顶层 `nodes/<type>.node.json`。

节点程序获得以下只读绑定：

```ts
input       // 兼容单输入值
inputs      // 按 targetPort 命名的输入对象
config      // 节点实例配置
runflow     // executionId、nodeId、outputDir、intermediateDir
```

普通单输出可以直接 `return value`。多输出必须显式返回 envelope，避免把普通业务对象误判成端口集合：

```ts
return {
  $runflow: 'port-outputs',
  outputs: {
    records: [{ id: 1 }],
    summary: '1 record',
  },
}
```

## 输出目录与调试产物

输出目录按以下优先级选择：

1. 单次 `run/test` 的 `outputDir`。
2. Workflow 自身的 `outputDir`。
3. 插件配置 `outputDir`。
4. 默认 `~/.dsh_agent_workflow/output`。

RunFlow 的运行时数据与 DSH 工作目录、插件安装目录完全分离：

```text
~/.dsh_agent_workflow/
├─ data/
│  ├─ workspace.json
│  ├─ workflows/
│  └─ .legacy-import-v1.json
└─ output/
```

首次升级会把旧 `<process.cwd()>/data/runflow/workspace.json` 和旧 Workflow 文件复制到新目录；旧文件不会自动删除，便于确认后手动清理。显式配置 `storageDir`、`workflowsDir` 或 `outputDir` 时仍尊重配置值。

每次执行都会落到独立目录，避免相互覆盖：

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

节点可调用 `context.log()` 写结构化日志，调用 `context.writeIntermediate()` 保存可定位的调试快照。JavaScript 节点会自动保存一次 `run-code-result` 中间结果。

## 类型引脚与多输出决策

当前实现采用“静态端口描述 + 运行时 JSON 值”的轻量方案：

- 类型包括 `any/json/text/number/boolean/file/files/image/audio/table/error`。
- Edge 使用 `sourcePort` 和 `targetPort` 路由；执行前拒绝不存在的端口、明显不兼容类型，以及不允许的多重输入。
- 未声明端口的旧节点继续视为兼容的 `any input/output`，无需立即迁移。
- 每个输出引脚悬停 500ms 显示有限字数预览；键盘聚焦也会显示；点击引脚或节点详情按钮打开完整 Details UI。

这部分的实现成本属于中等：协议、DAG 校验、路由、执行记录、UI 和迁移兼容都要同步调整，但收益明显，尤其是 HTTP、条件、Agent、信息搜集等天然多结果节点。当前没有照搬 ComfyUI 的动态端口、隐式转换、widget-as-input、惰性求值和二进制对象存储；这些会显著增加类型推导与版本迁移成本，后续按真实节点需求逐项加入更合适。

## Details UI 操作逻辑

- 运行后节点卡片显示状态与耗时；点击节点详情按钮、端口预览中的展开按钮，或 Execution Dock 的节点行均可打开 Details。
- Tabs：概览、输入、输出、日志、文件。
- 报错节点优先显示错误摘要；输出 Tab 按命名端口展示；文件 Tab 显示最终产物和 `intermediate/` 路径。
- 弹窗支持 Escape、焦点约束与焦点恢复；移动端不依赖 hover，点击仍可进入完整详情。

DSH 内嵌 UI 只执行真实 Host Workflow：客户端挂载插件自己的 Typert Remote 描述，使用当前主会话 ID 调用 `runflow/start`；Host 通过官方 `agent` lookup 解析或恢复确切 Agent，再立即返回 execution ID。UI 随后轮询 `runflow/execution` 同步节点状态、日志、错误和产物，并通过 `runflow/cancel` 停止同一 Agent 拥有的执行。跨 Agent 读取或取消会被拒绝，也没有匿名 HTTP 执行入口。

独立 Vite 工作台仅用于检查布局与交互；因为它不连接 DSH Host，Run 按钮会显示 Host 未连接并保持禁用。它不再生成任何模拟节点结果。

## Harness 原生集成

- `dsh.agent` 通过 `ctx.subagents.start()` 执行，父子 Session、工具权限、Persona、最大深度、取消和释放全部由 DSH 管理。
- `ctx.flow.runtimeCatalog()` 每次从 `ctx.subagents` 与 `ctx.llm` 读取实时目录；Provider/Model 不写死在插件里。
- Agent 节点的 `provider`、`model`、`maxTokens` 进入原生 `AgentOptions`；未配置项继承父 Agent。
- `script/` 是合法 Cordis 子插件，提供异步 request channel 和 `ctx.flowScript` service。
- `nodes/` 由独立 Node executor Cordis 插件管理；Node/Script 目录中的 `*.node.ts` 与 `*.script.ts` 是可热加载、可直接使用类型化 `ctx` 的可信 Host 子插件。
- UI Remote 以当前主 Agent 为授权边界；单节点调试会在 Host 执行目标节点及其全部上游依赖，不会按画布顺序伪跑。

当前内置节点能力边界：

- `trigger.manual`、`builtin.condition`、`builtin.set`：真实 Host DAG 节点。
- `dsh.agent`：真实调用 `ctx.subagents.start()`，动态使用 DSH Provider / Model。
- `script.javascript`：真实调用当前 Agent 可见的 `run_code`，通过异步 channel 等待结构化结果。
- `http.request`：真实调用 Host `fetch()`，支持 method、headers 和 JSON/string body。
- `storage.write`：把输入写入本次执行的持久化 `intermediate/` 产物并返回存储回执。
- `trigger.webhook`、`trigger.schedule`、`trigger.dsh-event`：对应 Host listener provider 尚未实现，当前在 UI/引擎中明确禁用。
- `dsh.llm`：尚未实现，当前明确禁用；AI 调用统一走已完成权限与生命周期集成的 `dsh.agent`。

可信 Host 调用示例：

```ts
const execution = await ctx.flow.execute('review-flow', {
  agentId: String(ctx.agent.id),
  input: { pullRequest: 42 },
  outputDir: 'D:/runs/review-flow',
})
```

## Script Channel

`ctx.flowScript.submit()` 返回 `{ requestId, result }`，也可通过 `ctx.flowScript.wait(requestId, signal)` 等待：

```text
queued → running → success | error | cancelled
```

终态结构包含 `value`、`logs`、结构化 `error`、排队/执行 timing，以及 `transport: run_code`、language 和 agentId。等待者自己的取消不会取消底层任务；底层任务归提交请求的 AbortSignal 所有。

## Node Provider API

```ts
export const inject = ['flow']

export function apply(ctx) {
  ctx.flow.registerNode({
    type: 'example.transform',
    title: 'Transform',
    description: 'Transform incoming JSON',
    category: 'data',
    color: '#2563EB',
    icon: 'braces',
    inputs: [{ id: 'source', type: 'json', required: true }],
    outputs: [{ id: 'result', type: 'json' }],
    async execute({ inputs, signal, log, writeIntermediate }) {
      signal.throwIfAborted()
      log('transform started')
      await writeIntermediate('normalized-input', inputs.source ?? null)
      return inputs.source ?? null
    },
  })
}
```

## 开发

```bash
pnpm install
pnpm dev
pnpm check
```

构建产物为 `lib/index.js`（Host）与 `lib/client.js`（DSH Web client）。

创造模式的编辑器标题栏提供 **Node Lab**：它直接读取 `nodes/` 与 `script/` 的 Host source library，保存后展示内容哈希版本并触发串行热重载。源码区使用项目内置的轻量编辑器，而不是 Monaco；支持行号、Tab 缩进、`Ctrl+Space`、输入 `.` 自动提示，以及 `ctx.flow`、`ctx.flowScript`、`ctx.agents`、`ctx.llm`、`ctx.tools`、`execution.node.config`、日志和中间产物 API 的基础补全。这样不会把完整 IDE 的 worker 与语言服务体积带入 DSH 主界面；复杂重构仍建议在 WebStorm 中使用 `defineRunFlowNodePlugin()` / `defineRunFlowScriptPlugin()` 的完整 TypeScript 类型。

随插件提供的可执行示例包括 `demo.context-probe`（读取实时 Agent/Provider）、`demo.multi-output`（类型化多输出与中间产物）和 `demo.run-code-channel`（异步等待 DSH `run_code` channel）。`agent.generated-normalizer` 与 `agent.generated-ctx-script` 是 source API / 热重载联调样例。

```text
nodes/                 # Node executor、文件草稿、固化 Provider 与类型化 Host 插件
script/                # Script executor、run_code channel 与类型化 Host 插件
~/.dsh_agent_workflow/ # workspace、Workflow 定义与每次执行的 outputs
src/authoring-tools.ts # 创造模式 scoped tools/skill
src/node-library.ts    # 文件草稿、目录监听、revision 测试闸门、原子固化
src/plugin-sdk.ts      # WebStorm 可补全的 Node/Script Cordis 子插件 API
src/output-store.ts    # 每次执行的文件布局与 artifacts
src/engine.ts          # 类型端口校验、DAG 调度、retry/timeout/cancel
src/flow-service.ts    # ctx.flow、DSH Agent adapter、runtime catalog
src/remote-service.ts  # Agent-authorized Typert Remote start/poll/cancel
src/remote-contract.ts # Client Remote descriptors and strict boundary codecs
src/client/            # 真实 Host 工作台、类型引脚预览、Details UI
```

视觉规范保存在 `design-system/dsh-runflow/MASTER.md`，Workflow 编辑页覆盖规则位于 `design-system/dsh-runflow/pages/workflow-node-observability.md`。
