# dsh-flow

运行在 DeepSeek Harness / Cordis 上的可视化 Agent Workflow 插件。当前实现提供 React Flow 编辑器、可信 Node Provider 注册、DAG 校验与并行执行、重试/协作式超时/取消、节点状态、单节点调试和 Execution 历史视图。

## Harness 原生集成

- `dsh.agent` 不创建独立的 Agent 框架，而是调用 `ctx.subagents.start()`；父子关系、Session、工具权限、Persona、最大委派深度、取消和释放均沿用 DSH 生命周期。
- Subagent transport 通过 `ctx.subagents.list()` 动态获取；LLM 路由通过 `ctx.llm.listProviders()` 与 `ctx.llm.listModels()` 动态获取。`ctx.flow.runtimeCatalog()` 返回 Host 侧实时目录；Inspector 直接订阅 DSH 官方 `ctx.modelDirectories`，随当前主会话、Provider 设置与适配器目录自动刷新。
- Agent 节点把 `provider`、`model`、`maxTokens` 写入原生 `AgentOptions`。未配置的字段继承父 Agent，不把模型目录误当成强校验白名单。
- `script.javascript` 由插件根目录的 `script/` Cordis 子插件提供。它不调用 `eval`，而是通过 `ctx.tools.execute({ name: 'run_code' })` 进入 DSH 的 Code Mode transport，因此会经过 Agent scope、工具策略、审批、审计和取消链路。

工作流执行 Agent 或 JavaScript 节点时必须由可信 Host 调用者提供一个仍在线的父 Agent：

```ts
const execution = await ctx.flow.execute('review-flow', {
  agentId: String(ctx.agent.id),
  input: { pullRequest: 42 },
})
```

JavaScript 节点要求该 Agent 已通过 DSH preset/config 启用 Code Mode。dsh-flow 不会临时切换 Agent 的工具展示模式，以免影响同一 Agent 上并行进行的模型步骤。

## Agent 节点配置

```json
{
  "subagentProvider": "spawn",
  "provider": "deepseek",
  "model": "deepseek-chat",
  "maxTokens": 8192,
  "maxDepth": 2,
  "persona": "You are a focused reviewer.",
  "prompt": "Review this input:\n{{input}}"
}
```

`subagentProvider` 是 DSH 的子 Agent transport（例如 `spawn` / `fork` / `acp`）；`provider` 和 `model` 是子 Agent 使用的 LLM 路由。Persona、depth 等能力由所选 Subagent Provider 的原生 capability gate 校验，不支持时会明确失败。

## Script Channel

`ctx.flowScript.submit()` 返回 `{ requestId, result }`，也可以通过 `ctx.flowScript.wait(requestId, signal)` 独立等待。Channel 状态为：

```text
queued → running → success | error | cancelled
```

终态结果为 lossless JSON，可安全穿过 Workflow 节点边界：

```ts
interface FlowScriptExecutionResult {
  requestId: string
  executionId: string
  nodeId: string
  status: 'success' | 'error' | 'cancelled'
  value?: JsonValue
  logs: string[]
  error?: { code: string; name: string; message: string }
  timing: {
    queuedAt: string
    startedAt?: string
    finishedAt: string
    durationMs: number
  }
  runtime: {
    transport: 'run_code'
    language: string
    agentId: string
  }
}
```

一个 waiter 的取消只停止该 waiter，不会取消底层运行；底层运行由提交请求的 AbortSignal 所有。节点超时会 abort 该 signal，并等待 DSH runtime / Subagent 完成协作式清理。

## 当前边界

- `ctx.flow` 和 `ctx.flowScript` 是可信进程内 Cordis Service。
- 浏览器端目前保存本地 Workflow JSON 并使用模拟执行；没有开放匿名 Host HTTP 写入或执行接口。Agent Inspector 的 LLM Provider/Model 候选复用官方会话模型目录，目录失败或使用 addressed subagent 会话时仍允许手工输入。Subagent transport 目录只存在于 Host Runtime；在加入带 Agent lookup/权限检查的 Typert Remote 前，前端保留自由输入。
- JavaScript 的 `input` 会作为 lossless JSON 注入 `run_code` 函数体；脚本不能获取原始 Cordis Context。
- 工作流只允许 DAG，不支持循环图。

## 开发

```bash
pnpm install
pnpm dev
pnpm check
```

独立预览通过 Vite 启动。插件构建产物为 `lib/index.js`（Host）和 `lib/client.js`（DSH Web 客户端）。

## Node Provider

```ts
export const inject = ['flow']

export function apply(ctx) {
  ctx.flow.registerNode({
    type: 'example.transform',
    title: 'Transform',
    description: 'Transform incoming JSON',
    category: 'data',
    color: '#38bdf8',
    icon: 'braces',
    async execute({ input, signal }) {
      signal.throwIfAborted()
      return { input }
    },
  })
}
```

## 结构

```text
script/
├─ index.ts           # 合法 Cordis 子插件、run_code adapter、ctx.flowScript
├─ channel.ts         # requestId 关联、多 waiter 异步 Channel
├─ contracts.ts       # 请求、状态、错误、timing 与结果结构
└─ README.md
src/
├─ contracts.ts       # UI / Runtime 解耦的 Workflow JSON 合约
├─ engine.ts          # DAG 校验、并行层调度、retry / timeout / cancel
├─ flow-service.ts    # ctx.flow、Subagent adapter、动态 Runtime Catalog
├─ index.ts           # Cordis Host 插件入口
└─ client/
   ├─ App.tsx         # Workflow 工作台
   ├─ model-catalog.ts # 当前会话官方模型目录的可订阅桥接
   ├─ store.ts        # Zustand 编辑器状态与本地版本
   ├─ WorkflowNode.tsx
   └─ index.tsx       # DSH 侧栏入口
```

视觉规范由 `ui-ux-pro-max` 生成并保存在 `design-system/dsh-flow/MASTER.md`。