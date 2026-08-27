# dsh-flow script plugin

此目录本身是一个合法 Cordis 插件：`index.ts` 导出 `name`、`inject`、`apply` 和默认 plugin 对象，由 dsh-flow Host 入口通过 `ctx.plugin(scriptPlugin)` 加载。

它只负责把 Workflow JavaScript 节点适配到 Harness 的保留工具 `run_code`。用户代码不会作为 Cordis plugin source 直接 eval，也不会得到 `Context`；可见能力由父 Agent 的 Code Mode、ToolRuntime scope 与策略决定。

异步协议由 `FlowScriptChannel` 管理。提交者拥有底层 AbortSignal，其他消费者通过 requestId 等待终态；等待者取消不会破坏正在运行的请求。