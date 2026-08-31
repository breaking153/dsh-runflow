# dsh-runflow Script executor

此目录由合法 Cordis `dsh-runflow-script` 子插件管理，并同时提供两种执行边界：

- `script.javascript`：通过当前 Agent scope 的 DSH `run_code` 隔离执行，不使用 `eval`，程序只能访问 `input`、`inputs`、`config` 和只读 `runflow`。
- `*.script.ts|mts|js|mjs`：可信 Host Script Cordis 子插件，可通过 `defineRunFlowScriptPlugin()` 直接使用带 WebStorm 类型补全的 `ctx`。

`FlowScriptChannel` 使用 requestId 管理 `queued → running → success | error | cancelled`，终态结果包含 lossless JSON、日志、结构化错误、timing、language 与 agentId。目录监听会在文件保存后动态卸载并重新加载对应 Cordis Fiber。

需要隔离、审批和工具策略时使用 `run_code`；确实需要 `ctx.tools`、`ctx.agents`、`ctx.llm` 等 Host 能力时，使用可信文件插件。模板位于 `_templates/agent-count.script.ts`。
