# RunFlow 状态图与触发入口交付记录

日期：2026-09-10。基线为已验证的全栈重构提交 `4ba9721`；本轮在隔离分支 `codex/langgraph-flow-20260910` 实施。原工作目录的既有修改保留。

实现提交 `b2f045f` 已推送并核对远端一致。新增状态图、触发入口和插件生命周期三份主规范已同步，变更已[归档](../openspec/changes/archive/2026-09-10-add-state-graph-and-triggers/)。

## 架构结论与决策

原执行器是一次性 DAG：禁止环、节点完成后不再激活，缺少共享状态归约和可恢复暂停。本轮增加可选状态图执行器，保留未声明执行模式的旧 DAG，采用 LangGraph 的状态、按步提交与 checkpoint 思路。

- **Ruling: 原生 JSON 状态图 — 复用 DSH 的模型、Provider、权限及插件生命周期，避免再建立一套 Agent 权威 — 代价是维护自己的调度器，不承诺 LangGraph API 兼容。**
- **Ruling: 插件托管运行工具与 skill，并在调用时检测可用性 — 生命周期可自动清理，缓存的旧工具也无法绕过卸载状态 — 代价是重新启用后须重新发现能力。**
- **Ruling: Webhook 使用现有 Host 服务和临时绑定 — 绑定始终对应当前在线 Agent，不把身份或 token 写进工作流 — 代价是重启后需要重新启用绑定，不提供离线投递。**

对照依据见官方 [Graph API](https://docs.langchain.com/oss/javascript/langgraph/graph-api)、[Pregel](https://docs.langchain.com/oss/javascript/langgraph/pregel)、[Persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence) 和 [Interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts)。详细参数、调用方式及代码入口见 [使用指南](STATE_GRAPH_GUIDE.md)。

## 完成的行为

| 层面 | 实现 |
| --- | --- |
| 执行 | 同一步共享快照；replace/append/sum/merge 归约；冲突检测；有限循环；any/all 激活；逐步执行记录 |
| 控制节点 | Branch、Switch、Parallel、Join、Loop、State Read、State Update、Interrupt、End，共 9 类 |
| 入口 | 手动、Agent 调用、鉴权 Webhook；入口按调用来源选择；旧流程的 Agent 调用可回退到手动入口 |
| 恢复 | 显式暂停的 checkpoint、冻结流程定义、原执行 ID；owner 与并发恢复校验；已提交前置步骤不重放 |
| DSH | 普通 Agent 的 `runflow` 工具及 `dsh-runflow` skill；创造工具仍按 preset 限定；卸载注销贡献、关闭路由并取消执行 |
| 界面 | 状态图运行设置、控制节点表单、循环连线、逐步证据、JSON 恢复、临时 Webhook 启停与一次性 token |
| 文档 | 中英文 README、产品与能力表、使用指南、三个不含真实凭据的导入示例；Markdown 隐私回归 |

Webhook 接收采用 POST、Bearer 摘要校验、JSON 类型及有限数值校验、64 KiB 请求上限、10 秒读入超时、32 个活跃执行的接收门限。凭据仅在创建时返回，撤销、旋转或卸载后旧请求不能继续启动流程。

## 验证与复核

最终 `pnpm check` 于 2026-09-10 完成，退出码为 0，覆盖前后端类型、45 个测试文件 / 256 项测试、Host 构建、DSH 客户端构建和生产预览构建，全部通过。新增回归涵盖状态隔离和归约、路由/循环/汇合、checkpoint 保存失败、冻结定义恢复、多中断恢复、归属隔离、取消竞态、插件卸载等待 Provider 清理、Webhook 慢请求撤销与有限 JSON 输入，以及前端会话切换和保存状态。

独立复核发现的路由前缀匹配、慢请求撤销、卸载清理、非有限输入、Provider 收尾和暂停保存期间取消问题均已修复并由回归覆盖。示例回归验证循环结果为 `3`、并行求和为 `5`、人工审阅暂停后按恢复值继续。

浏览器使用本地 Chromium：在 1440、1024、768、375 像素宽度检查画布和运行设置；在桌面及窄屏检查控制节点、离线 Webhook 和模拟暂停展示。截图使用示例定义与模拟执行记录，仅证明界面行为，不代表真实 DSH Agent 或外部 Webhook 已部署。Webhook 后端另由本地回环 HTTP 测试验证。

| 证据 | 桌面 | 窄屏 |
| --- | --- | --- |
| 图设置 | [1440](../output/playwright/state-graph/settings-1440.png) | [375](../output/playwright/state-graph/settings-375.png) |
| Loop 配置 | [1440](../output/playwright/state-graph/loop-1440.png) | [375](../output/playwright/state-graph/loop-375.png) |
| Webhook 不可用态 | [1440](../output/playwright/state-graph/webhook-1440.png) | [375](../output/playwright/state-graph/webhook-375.png) |
| 暂停与 JSON 输入 | [1440](../output/playwright/state-graph/paused-1440.png) | [375](../output/playwright/state-graph/paused-375.png) |

四种宽度均无页面横向溢出；375 像素下运行设置边界为 x=60–371，暂停面板为 x=62–361，并验证了[滚动后恢复按钮可达](../output/playwright/state-graph/resume-controls-375.png)。修复了设置面板宽度与暂停面板遗留居中位移造成的窄屏裁切。生产构建也在 [1440](../output/playwright/state-graph/production-1440.png) 与 [375](../output/playwright/state-graph/production-375.png) 完成模式切换和步数输入，浏览器未报告脚本错误。

未添加生产依赖或更改锁文件。生产预览主包由基线 645.66 kB / gzip 181.49 kB 增至 668.30 kB / gzip 189.33 kB，增加来自状态图编辑、恢复及 Webhook 界面。现有单包超过 500 kB 的构建提示仍在，未抬高告警阈值。这里报告构建体积与功能验证，没有声称生产吞吐或页面性能评分。

## 使用边界与回退

这是单 Host、本地文件的状态图实现。支持显式节点边界暂停恢复；不提供崩溃时 RUNNING 自动恢复、动态 Send、分布式调度、跨进程锁、任意指令位置恢复、历史时间旅行或 exactly-once 外部副作用。恢复保持冻结的流程定义，但使用恢复时当前可用的 Provider。

旧 DAG 文件无需迁移。含循环的新图必须先移除循环才能切回 DAG；新状态图文件不能交给旧版本执行器。回退代码应保留新工作流和执行数据的备份，避免旧版本覆盖新记录。禁用插件会注销其工具、skill、HTTP 路由及临时绑定，不删除用户自行维护的 skill 文件。

定时器、DSH 事件触发器和独立 LLM Provider 仍未实现。本轮未操作真实 Agent 业务、生产服务或用户的运行数据。
