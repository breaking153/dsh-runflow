# 可运行示例 / Runnable demos

这四个示例使用随 RunFlow 提供的节点，不需要模型凭据。全部采用 **Blueprint + State graph**：flow 连线决定操作顺序，纯数据节点在参数被使用时计算。HTTP 示例还需要启动本地接口。

| 示例文件 | 练习内容 | 预期结果 |
| --- | --- | --- |
| [Demo 01 · 数据处理](../examples/workflows/demo-data-pipeline.workflow.json) | JSON → Filter → Sort → Limit，随后 Storage | 保存两条记录，顺序为 `RF-103`、`RF-101` |
| [Demo 02 · 条件分支](../examples/workflows/demo-conditional-branch.workflow.json) | Boolean → Branch，只执行一个结果分支 | `true` 返回 approved；`false` 返回 review |
| [Demo 03 · 共享 HTTP](../examples/workflows/demo-shared-http.workflow.json) | 两个 Trigger 共用 HTTP，URL 属性引脚、Storage 和后续操作 | 手动运行产生两次独立请求、两份保存记录 |
| [Demo 04 · 循环与确认](../examples/workflows/demo-loop-approval.workflow.json) | 有界循环、共享状态、暂停与恢复 | 计数到 3 后暂停；恢复后返回计数与确认值 |

## 在 DSH Web 中打开 / Open in DSH

1. 确认 DSH 已加载当前 RunFlow 插件，并打开一个可运行工作流的主会话。
2. 将所需的 `demo-*.workflow.json` 文件复制到 RunFlow 配置的 `workflowsDir`。未单独配置时，它位于 `<storageDir>/workflows`；两个目录均未配置时，默认是 `~/.dsh_agent_workflow/data/workflows`（`~` 为 Host 用户的主目录）。保留 `.workflow.json` 后缀。目录中每个工作流 ID 必须唯一：再次复制同一示例时替换已有文件，或修改 JSON 中的 `id` 以保留两个副本；仅改文件名不会更新同 ID 的工作流，重复 ID 的后续文件会被忽略。
3. 默认开启的文件监听会重新读取该目录。重新打开 RunFlow 或刷新 DSH Web，在 **工作流 / Workflows** 中搜索 `Demo 01` 至 `Demo 04`。若配置了 `watchFiles: false`，需重载插件后再刷新。
4. 打开示例，点击 **适应画布 / Fit view** 查看完整连线，然后点击 **执行工作流 / Execute workflow**。在执行详情中查看输出、状态与逐步记录。

当前界面提供导出 JSON，但没有工作流 JSON 的“导入”按钮；**Node Lab** 编辑的是 Node/Script 源码。通过 Host 的工作流保存接口载入同一份 JSON 后，也可直接在列表中打开。

English: copy a demo into the configured `workflowsDir` (default: `<storageDir>/workflows`, or `~/.dsh_agent_workflow/data/workflows` if neither is configured). Replace the existing file when reusing its workflow ID, or change its JSON `id` to keep both copies; renaming the file alone leaves a duplicate ID that is ignored. Reopen RunFlow and select it from **Workflows**. Use **Fit view**, then **Execute workflow**. File watching is enabled by default. These files contain editable definitions, with no published version metadata.

## Demo 01 · 筛选高分记录 / Top records

上方 flow 路径为 `Start → Storage → Result`。下方纯数据路径从五条任务记录中过滤 `active = true`，按 `score` 降序排列，再取前两项；Storage 需要输入时才会计算这条路径。

执行成功后，最终输出是 Storage 回执：`stored` 为 `true`，`collection` 为 `demo-top-items`，`path` 指向本次运行实际保存的 JSON 文件。回执的 `value` 为：

```json
[
  { "id": "RF-103", "title": "Repair export", "active": true, "score": 97 },
  { "id": "RF-101", "title": "Improve search", "active": true, "score": 91 }
]
```

可以把 **Top 2** 的 `maxItems` 改为 `1`，验证只保留 `RF-103`。Storage 保存的是每次执行的文件产物，回执中的路径和文档 ID 会随执行变化。

## Demo 02 · 条件分支 / Conditional outcomes

选择 **允许发布？ / Allow**，修改它的布尔 `value`，然后重新运行：

| Allow | 唯一执行的结果分支 | 最终输出 |
| --- | --- | --- |
| `true`（默认） | 允许发布 / Approved | `{"decision":"approved","next":"publish"}` |
| `false` | 转人工复核 / Review | `{"decision":"review","next":"manual-review"}` |

未选中的操作及其结束节点显示为跳过。两条备选路径各自结束，不需要等待另一条路径；示例中的发布与复核均为返回决策数据，不会发布内容或发送消息。

## Demo 03 · 双入口共享 HTTP / Shared request

先在运行 DSH Host 的同一台机器上，从仓库根目录启动[本地示例接口](../examples/demo-http-server.mjs)：

```console
node examples/demo-http-server.mjs
```

它默认监听本地端口 `18947`，终端使用 `Ctrl+C` 停止。请求由 DSH Host 发出；远程使用 DSH Web 时，URL 中的 127.0.0.1 指的是 Host 所在机器。

示例的 **Endpoint** 文本节点提供 `http://127.0.0.1:18947/echo`，连入 HTTP 的 URL 属性引脚。**Body** JSON 节点提供请求正文。HTTP 的 `flow` 输出只在成功后驱动 Storage，Storage 再驱动 **Continue → Result**；响应数据使用单独的 `body` 连线。

点击一次 **执行工作流 / Execute workflow** 会运行两个手动入口。HTTP、Storage、Continue 与 Result 各访问两次；执行记录保留两次调用，最终输出显示结束节点最后一次访问的回执。回执的 `value` 应为：

```json
{
  "ok": true,
  "method": "POST",
  "path": "/echo",
  "body": { "demo": "shared-http", "message": "Hello RunFlow" }
}
```

两次 Storage 访问分别保存一份响应，集合名均为 `demo-http-responses`。可以在 Host 调用中通过 `entryNodeIds` 仅选择 `demo-http-start-a` 或 `demo-http-start-b`，各自都会运行同一条链一次。

验证失败路径：把 **Endpoint** 的值改为 `http://127.0.0.1:18947/fail`，再运行。预期执行失败并显示 `HTTP 503`，Storage 和 Continue 不执行。之后把 URL 改回 `/echo`。

## Demo 04 · 循环与确认 / Loop and approval

点击 **执行工作流 / Execute workflow** 后，`count` 从 `0` 累加到 `3`，然后 **Pause for Input** 进入暂停状态。循环节点最多执行三次 continue 分支；工作流还设有 20 步上限。

1. 在执行详情中确认状态为 `PAUSED`，共享状态为 `{"count":3}`。
2. 在 **恢复输入 · JSON / Resume input · JSON** 中输入 `true`，点击 **恢复执行 / Resume execution**。
3. 预期状态变为 `SUCCESS`，最终输出为 `{"count":3,"approved":true}`。输入 `false` 则返回 `{"count":3,"approved":false}`。

恢复会继续暂停的执行，不会再累加三次。**Final state** 是纯状态读取节点，在结束节点需要数据时读取恢复后已提交的状态。恢复使用暂停时的流程版本；再次点击 **执行工作流** 则是从初始状态开始的新执行。

English: run until **PAUSED**, enter JSON `true` or `false`, then select **Resume execution**. The final result is `{count: 3, approved: <your response>}`. Resume continues the existing run; **Execute workflow** starts a new one.

## 自动验证 / Automated verification

```console
pnpm exec vitest run tests/workflow-demos.spec.ts tests/demo-http-server.spec.ts
```

工作流测试实际执行这些 JSON 定义及内置节点，校验两种条件分支、双入口与单入口 HTTP、服务端失败、循环次数及序列化 checkpoint 恢复。Storage 测试使用真实临时文件并读取保存内容；工作流中的 HTTP 自动测试仅替换外部网络响应。本地服务测试在隔离的子进程中验证畸形 URL 和 JSON 返回 HTTP 400、超过 64 KiB 的正文返回 HTTP 413，并确认拒绝请求后服务仍可访问。DSH Web 中的真实 HTTP 验证使用上述本地服务。

有关连线、属性引脚和兼容行为，参见 [Blueprint 执行指南](BLUEPRINT_EXECUTION_GUIDE.md)。
