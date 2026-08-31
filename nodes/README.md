# RunFlow Node Library

此目录由独立的 `dsh-runflow-node-executor` Cordis 插件管理并实时监听。

- `.drafts/*.node.json`：`runflow_node(create/update)` 立即写入的可执行草稿，不再只存在内存。
- `*.node.json`：当前 revision 测试成功并执行 `commit` 后的固化程序节点；通过 DSH `run_code` 隔离执行。
- `*.node.ts|mts|js|mjs`：可信 Host Node Cordis 子插件，可直接使用 `ctx` 提供的 DSH/Cordis 服务。
- `_templates/`：WebStorm 可直接打开的强类型模板，不参与动态加载。

JSON 程序节点遵循 draft → real-engine test → commit，保留 revision 校验与 `run_code` 审批/审计边界。Host Node 插件属于可信本地代码，保存文件后会卸载旧 Cordis Fiber、动态导入新版本并重新注册 Provider。

推荐从 `_templates/provider-catalog.node.ts` 复制开始。`defineRunFlowNodePlugin()` 会为 `ctx` 和节点执行上下文提供完整类型补全；`inject` 中声明需要的 Host 服务。
