# 蓝图画布交互与视觉重构报告

日期：2026-09-10。变更：`refine-canvas-interactions`。本轮修复拖动时画布跳变、端口命中与连线反馈问题，并按用户要求采用 UE Blueprint 启发的石墨色工作台。保留 DSH 蓝色、现有图编辑能力和 Host 权限边界。

**状态：最终工程与浏览器验证通过。** `pnpm check` 在全部代码冻结后通过 50 个测试文件、300 项测试，以及前后端类型检查、Host/客户端与 preview 构建。基线为 256 项测试。生产构建也完成真实浏览器拖动与非法连接复核；详细证据和验证边界如下。

## 方向选择

| 方向 | 结论与理由 |
| --- | --- |
| 保留紧凑浅色编辑器 | 淘汰。不能回应用户对蓝图风格、端口辨识和节点可读性的要求 |
| 发光、电影化蓝图皮肤 | 淘汰。强光与装饰动画会干扰类型名、状态和连线，没有操作收益 |
| 石墨色图工作台、节制的分类标题、DSH 蓝色选中态 | 采用。尖角 flow 与圆形数据端口直观区分执行和数据，层级围绕图与参数组织 |

Blueprint 是图编辑形态参考，没有复制 Unreal 源码、图标或纹理。工作流、状态图设置、运行与暂停恢复仍在既有 DSH 工作台中，不增加首页或另一套执行平台。

参考 Epic 官方 [Nodes 文档](https://dev.epicgames.com/documentation/en-us/unreal-engine/nodes-in-unreal-engine) 中执行与数据 pin 的区分、兼容连线和无效连接提示；本项目仍采用自己的类型与调度规则，没有引入 UE 的自动类型转换。

## 已定位的问题与实现

| 问题 | 根因证据 | 处理 |
| --- | --- | --- |
| 拖动节点后画布突然缩小 | Chromium 基线中，拖动触发 Inspector 打开，画布宽度由 1188px 变为 828px | 在节点、框选和连线手势期间保持 Inspector 几何；明确点击或键盘选择仍可查看参数 |
| 临时连线出现黑色闭合区域 | 临时 Bezier path 未明确 `fill: none`，开放路径可按填充规则闭合 | 临时连线组件和结构样式明确禁用填充，颜色按合法性或端口类型显示 |
| 引脚出现双圆、命中与视觉不一致 | 28px 透明 Handle 被后置的 12px 填色规则覆盖，原伪元素仍存在 | 固定 28px 命中区域，将独立圆形或尖角图形放在其中；悬停不缩放，不改变锚点 |
| 无效拖线松开后没有解释 | 连接校验没有提供连续可见的诊断 | 拖动中显示红线和本地化原因，释放保留可访问说明且不添加边；无效目标不打开节点搜索 |
| 分组尺寸与撤销不一致 | 调整尺寸需进入持久化 UI 元数据及手势历史 | 完整 resize 手势记录一次尺寸变更，支持保存、撤销与重做 |
| 重复 Host 状态和缩放控件 | 多层工作台 chrome 叠加 | 保留一个通用 Host 状态和一组缩放控件，保留特定功能的离线原因与保存错误 |

节点和 pin 的主要视觉规则集中到 [blueprint-styles.ts](../src/client/blueprint-styles.ts)。本轮清理四份旧样式中的 94 处重复节点选择器，避免继续叠加紧凑样式。React Flow 保持对节点位置和包装层的控制；hover 只调整边框、颜色或阴影，不对图坐标添加动画。

## 设计变量与资产

| 用途 | 变量或规范 |
| --- | --- |
| 画布 / 普通表面 / 抬高表面 | `--rf-canvas: #1b2028` / `--rf-surface: #252b34` / `--rf-surface-raised: #2d3440` |
| 边框 / 主文字 / 次文字 | `--rf-line: #3a424f` / `--rf-ink: #e2e7ee` / `--rf-muted: #a1acbd` |
| 主操作 / 键盘焦点 / 错误 | `--rf-accent: #4279cb` / `--rf-focus: #9dc5ff` / `--rf-danger: #f07887` |
| 节点与文字 | 256px 节点宽度、清晰标题和类型行；系统 sans 与系统 monospace，不下载新字体 |
| 端口与线 | flow 为尖角，数据为圆形；类型色共享 [port-presentation.ts](../src/client/port-presentation.ts)，同时保留类型文本 |
| 圆角与动效 | 界面基础圆角 6px，节点 7px；减少动画偏好下关闭相应过渡，图坐标不做装饰动画 |

沿用仓库中的 RunFlow SVG 与现有 Lucide 图标。仓库 README 声明 MIT；已安装 Lucide 包保留其 ISC 许可及 Feather 来源部分的 MIT 归属。本轮没有引入外部素材、新字体或依赖，不改变已有许可声明。移除旧样式中的 Google Fonts 外链，控件使用系统字体回退。

## 共享规则与兼容性

[port-types.ts](../src/port-types.ts) 同时供前端候选连接与 Host 引擎使用；[control-node-catalog.ts](../src/control-node-catalog.ts) 统一控制节点的元数据，避免 UI 与 Host 分别维护一套端口类型。

连接接入点沿用 React Flow 官方 [Validation 示例](https://reactflow.dev/examples/interaction/validation) 的 `isValidConnection` 机制，并在 RunFlow 中补充实时预览、释放后的诊断以及 Host 校验。

| 输出类型 | 可连接输入 |
| --- | --- |
| `flow` | 仅 `flow` |
| 已知数据类型 | 同类型，或显式的 `any` 数据输入 |
| `any` | 仅 `any` |

例如 `text → number`、`number → json`、`flow → any`、`any → json` 都被拒绝。规则依据 Provider 声明的类型，不因当前 JSON 值看似可转换就隐式转换。

方向、缺失端口、重复边和类型错误会得到解释。DAG 继续拒绝循环及被占用的单输入；状态图保留有界循环和按消息激活的多入边规则，不能声称两种模式对连接基数完全相同。状态图单输入在同一步真正收到多条消息时，仍可能因基数不符失败。

控制节点旧端口 ID `input` 保留，类型收紧为 `flow`；支持数据的控制节点新增可选 `data: any`。Join 与 State Read 只接 flow。State Read 的输出为 `json`，End 可接 `data` 并输出 JSON 值。两个读取状态后结束的示例改为 `state.read.output → control.end.data`。

旧文件不自动改写。依赖宽松类型规则的错误连接会被拒绝，用户需接到新的数据端口或显式转换节点。普通数据接入本身仍能激活状态节点，新增 `data` 不是 UE 式自动等待 flow 的机制；需要等待关系时应明确使用控制流和状态。完整修复说明见[状态图指南](./STATE_GRAPH_GUIDE.md#端口形状类型与旧图兼容)。

历史用户模板可能保存旧的 FlowNode 端口元数据。模板粘贴的兼容修补仅为当前 catalog 已知的 workflow 节点刷新 `inputs/outputs`，保留用户配置、名称、位置和边；不会自动转换或删除旧边，也不猜测未知 Provider、group、reroute 或 subflow 的类型。此增量纳入最终回归检查。

本轮保留 Workflow 格式、节点 ID、状态归约与 checkpoint、当前 Agent 授权、插件运行工具和 skill 生命周期。没有迁移用户数据、部署服务或执行真实 Agent。

## 验证记录

新增回归覆盖类型矩阵、前后端控制目录一致性、临时线无填充、错误反馈、节点与框选手势、分组 resize 的持久化与撤销。以下浏览器证据来自本地 Chromium 开发预览，使用真实 pointer 事件、DOM 和 store 结果检查，没有连接真实 DSH Host。

| 检查 | 基线或预算 | 已确认结果与剩余检查 |
| --- | --- | --- |
| TypeScript、完整测试与构建 | 基线 256 测试 | 最终 `pnpm check` 退出 0；50 文件、300 测试通过，测试阶段 17.00 秒；前后端类型检查及全部构建通过 |
| 1440 / 1024 / 768 / 375 视口 | 页面无横向溢出，主要控制可达 | 四宽均无横向溢出，运行设置面板在视口内；本次采集无 `pageerror` |
| 节点拖动与框选 | 手势期间画布边界不变；基线拖动缩窄 360px | 节点实际拖动前和拖动中画布均为 1200 × 842px，位置也不变；框选有组件回归，未单独记录浏览器几何 |
| 引脚 hover 与拖线 | 28px 命中区，锚点固定，尖角与圆形可辨 | 源码固定 28px 命中区；实际 hover 前后中心 x/y 完全相同，临时线计算样式为 `fill: none` |
| 无效与有效连线 | 拒绝时红线、文本、边数不变；有效反向拖线正常 | `text → number`、`flow → number` 显示红线和类型原因并拒绝；`text → text` 与反向拖出的 `flow → flow` 正确保存 |
| 模板兼容性 | 现行端口规则与旧模板元数据 | 已核对内置样例 25 条边类型合法；历史模板刷新端口、保留配置与既有边、未知与视觉节点保留的回归均通过 |
| 分组 resize / undo / redo | 保存新尺寸，单步恢复旧尺寸 | 真实拖动由 400 × 280 变为 448 × 328；dirty 为 true、手势结束；undo 还原，redo 恢复新尺寸 |
| Host 状态与缩放控件 | 各一处通用入口 | DOM：Host 1 处、zoom 1 组、旧 host-strip 0 处、旧 React Flow Controls 0 组 |
| 键盘、文字与减少动画 | 焦点可见，文本可读，尊重用户偏好 | Tab 到“添加节点”时 `focus-visible` 为 true，实线轮廓 2px；浏览器操作在减少动画模式下完成；长标签专项未单独验证 |
| 标题文字对比度 | 按实际计算样式检查 | `#e2e7ee` 文字与 `#242b35` 背景的 sRGB 对比度约 11.48:1；仅代表这组颜色，不代表全界面认证 |
| Impeccable detector | 实际运行并检查结果 | 结果为 `[]`，0 个发现；后续视觉复核与小屏修复见下文 |
| preview gzip | 基线 189.33 kB；增长预算不超过 10% | 最终 196.05 kB，增长约 3.55%；JS 688.91 kB；保留现有 CJS 与大于 500 kB chunk 警告，没有放宽阈值 |
| 生产构建预览 | 检查实际构建资源 | 拖动画布仍为 1200 × 842px，非法连接红线和原因正确且不新增边；375px 添加按钮为 16px 图标并有可访问名称；Host 1 处，无页面错误 |
| Markdown 隐私、差异与 OpenSpec | 保留隐私规则，不加入主机路径、凭据或调试日志 | 隐私回归 10/10；`git diff --check` 与 OpenSpec 全量严格校验通过 |

检测器没有发现问题后，新的视觉复核仍发现 375px 下“添加节点”文字溢出。小屏按钮现以 `font-size: 0` 隐藏文字并保留 `aria-label` 和 `title`；已重新截图并由集成检查目视确认。检测器结果不替代这一轮视觉审查。

| 截图证据 | 内容 |
| --- | --- |
| [1440px](../output/playwright/blueprint-editor-1440.png)、[1024px](../output/playwright/blueprint-editor-1024.png)、[768px](../output/playwright/blueprint-editor-768.png)、[375px](../output/playwright/blueprint-editor-375.png) | 石墨色编辑器与四宽布局 |
| [节点拖动](../output/playwright/blueprint-node-drag.png)、[分组调整尺寸](../output/playwright/blueprint-group-resize.png) | 手势中的画布与完成的分组尺寸 |
| [错误数据连接](../output/playwright/blueprint-invalid-connection.png)、[flow 类型错误](../output/playwright/blueprint-flow-mismatch.png) | 即时红线与类型原因 |
| [有效数据连接](../output/playwright/blueprint-valid-connection.png)、[反向 flow 连接](../output/playwright/blueprint-reverse-flow.png) | 合法连线预览与方向 |
| [375px 运行设置](../output/playwright/blueprint-settings-375.png) | 小屏设置面板边界 |
| [生产构建](../output/playwright/blueprint-production.png)、[测量记录](../output/playwright/blueprint-evidence.json) | 实际构建的错误连接状态及结构化验证结果 |

本轮没有有效的拖动延迟、帧率或端到端交互性能统计。脚本采集总耗时包含截图、其他操作和等待，不能用作节点拖动性能；报告仅记录实际几何和行为结果。

## Skill 与工具状态

| 能力 | 本轮实际使用方式与边界 |
| --- | --- |
| Impeccable | 兼容读取设计指导，并实际运行 detector，结果 `[]`；另做四宽视觉复核并修复小屏按钮溢出，不把自动检测等同于完整 UI 认证 |
| React 指导 | 兼容加载性能建议，检查共享状态订阅、节点与边渲染及手势期间工作量；不宣称生产性能达标 |
| 系统化调试 | 兼容加载调试流程，先根据浏览器几何与样式冲突定位根因，再用定向回归验证 |
| Playwright | 兼容加载浏览器验证流程，操作本地预览并读取 DOM、指针及几何证据；没有真实 Host 执行 |
| OpenSpec | 现有 CLI 可用，沿用仓库变更流程；不声称原生 slash 命令在本轮活跃 |
| 安装与额外插件 | 没有新增安装、依赖、字体、hook 或外部素材；可访问性与性能检查采用内置工程检查 |

## 限制、回滚与交付

本地 Chromium 开发/生产预览与组件测试不能认证真实 DSH Host、所有浏览器、屏幕阅读器或完整 WCAG。没有大型工作流、低性能设备、生产 P95/P99 或持续负载测量，本轮不虚构这些指标。状态图执行、Webhook 权限与外部副作用仍受各自原有边界约束。

并行测试曾触发 Host 集成测试默认 1 秒等待超时。用单次延后 1.2 秒的正常持久化复现后，将测试轮询上限设为 4 秒，保留全部业务断言和原 5 秒测试总时限，并增加错误诊断；最终运行已移除临时延迟和 mock。受控延迟另曾暴露 Windows 执行记录文件重命名 `EPERM`，正常最终测试未复现。本轮没有改动生产文件锁处理，长期文件锁干扰仍是残余风险。

修改在隔离工作树完成，原目录保留。若需回滚，应使用新的反向提交，并一起回滚前端与 Host 的共享端口契约及控制节点描述，避免界面与执行规则分离；不重写历史，不自动覆盖用户 Workflow 文件。已按新端口修复的用户图应在回滚后重新校验。

交付分支：`codex/drag-ui-refactor-20260910`。OpenSpec 变更 `refine-canvas-interactions` 同步并归档；代码、文档和截图一起交付。采用普通提交与推送，不覆盖原工作目录或重写远端历史；本轮没有部署到真实 DSH Host。
