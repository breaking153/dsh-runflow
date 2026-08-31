# RunFlow Workflow Library

每个通过 UI 或创造模式工具创建的工作流都会立即写入一个 `*.workflow.json` 文件。

- 文件是可直接交给 RunFlow Engine 执行的 `WorkflowDefinition`。
- UI 执行前会先保存；Host Remote 也会在启动执行前再次确认文件已持久化。
- 目录由 Host 监听，使用 WebStorm 修改并保存后无需重启 DSH。
- `data/runflow/workspace.json` 继续保存执行历史；Workflow 文件是工作流定义的独立来源。

不要手工修改执行中的 `version`、`publishedVersion` 或时间字段；普通节点、连线和配置可以直接编辑。
