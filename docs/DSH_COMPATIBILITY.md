# DSH 0.1.5-rc.1 兼容性记录

验证日期：2026-09-10。`npm view @deepseek-ai/dsh dist-tags --json` 返回 `latest` / `next` 为 `0.1.5-rc.1`，`alpha` 为 `0.1.5-alpha.2`。目标版本以此次实时查询为准。

## 本次范围

更新当前 Web profile 已安装的 RunFlow 和 Enhanced Settings：全部 DSH peer/dev 依赖固定为 `0.1.5-rc.1`，并声明 `dsh.engines.dsh`。插件自身仍为本地开发版本 `0.1.0`，没有发布 npm 包。DSH 源码仓库、codex-connect 与未安装的 dsh-web 插件合集不在本次修改范围。

两插件在新版 SDK 下无需修改业务 API 调用。RunFlow 将 Vitest 的测试发现范围限制在当前 `tests/`，防止递归执行 `.worktrees/` 内另一份项目并混用 React 实例，同时保留主线已有的并发上限。现有开发内容保留。

## 本地 Web 启动

`<user-home>/.dsh/profiles/web/package.json` 安装了 `@deepseek-ai/dsh@0.1.5-rc.1`，`web` 脚本使用此本地 CLI。profile 保留 `autoInstallPeers: false`，因此显式声明所需的 24 个运行时 peer 包（23 个同版 DSH 包与 `@deepseek-ai/cordis-plugin-group@1.0.2`），避免重装时丢失启动依赖。RunFlow 和 Enhanced Settings 继续链接当前源码目录的 `lib/` 构建产物，bundle 顺序与用户 `cordis.patch.yml` 未改变。

```powershell
pnpm --dir "$env:USERPROFILE\.dsh\profiles\web" run web
```

也可以在希望作为默认工作区的目录运行：

```powershell
& "$env:USERPROFILE\.dsh\profiles\web\node_modules\.bin\dsh.cmd" web
```

系统全局 `dsh` 当前仍为 `0.1.1-rc.2`，源码 checkout 为 `0.1.5-alpha.2`；不要用它们代替上述已验证版本。没有重启用户已有服务。已有服务需要用户重启后使用新构建，页面刷新本身不会替换 Host。

## 验证

- 两插件 `pnpm run typecheck` 通过。
- RunFlow `pnpm test`：26 个测试文件、92 项通过；Enhanced Settings：5 个文件、14 项通过。
- 两插件 `pnpm run build` 通过；RunFlow 的独立 Vite 预览也构建成功。保留现有 CJS 模块包装与大包体积提示，没有隐藏警告。
- 新版 CLI 对正式 Web profile 的 `--dump-config` 成功；断言核对 codex-connect dependency、原有 bundle 顺序和用户 patch 未变化。
- 正式 profile 的 `pnpm run web -- --help` 成功，解析到新版支持的 Web 启动参数。
- 补齐必需 peer 后，正式 profile 的 `pnpm install --frozen-lockfile` 成功，`pnpm peers check` 无问题；重新验证 `pnpm exec dsh --version` 返回 `0.1.5-rc.1`，上述启动帮助仍成功。
- 隔离 DSH home 在 `127.0.0.1:18943` 启动 `0.1.5-rc.1`；浏览器中 RunFlow 和增强设置页面正常加载，没有插件模块加载错误。
- 隔离会话中，RunFlow Remote 返回 `apiVersion: 2` 和 27 个注册节点；通过真实 RPC 保存工作流并执行手动触发节点，执行和节点均为 `SUCCESS`。
- Enhanced Settings 的真实 GET/PUT 路由读取会话选项，将工具展示改为 `native`，revision 从 0 增至 1；使用旧 revision 写入返回 409。
- 最终使用正式 profile 内安装的 CLI、相同隔离 home 和端口 `18944` 再次启动，重复上述两个插件的真实 API 验证，结果通过。验证结束后关闭本任务创建的临时 Host。

截图：[RunFlow](../output/playwright/dsh-015-runflow.png)、[增强设置](../output/playwright/dsh-015-enhanced-settings.png)。首次打开空白 Host 时 RunFlow 要求选择主会话，这是已有行为；真实执行验证使用隔离环境创建的主会话。

## 主线同步复核

2026-09-10，本地 `master` 同步至 `89accbd` 后，本次 DSH `0.1.5-rc.1` 升级以独立提交交付。README 仅移植版本说明；Vitest 同时保留主线的并发上限和本次新增的 `tests/` 范围，避免扫描隔离工作树。

重新执行 `pnpm install --frozen-lockfile`、前后端类型检查、完整测试（`--maxWorkers=2`）及构建均通过：50 个测试文件、300 项测试，测试阶段 34.76 秒。8 项 OpenSpec 严格校验通过。这次验证覆盖最新蓝图和状态图代码与新版 SDK 的组合；上面的 92 项测试仍是首次升级时的历史记录，本次没有重启或复测正式 Host。

同步前的 121 个改动文件已完整备份并核对 SHA-256，同时保存于本地 stash `94d8bcf`。仅恢复独立升级增量，旧界面快照仍可从备份恢复。

## 权限、数据与可靠性

未引入新接口、数据格式、授权策略或外部服务。真实 RPC 验证使用隔离 home 和独立 RunFlow storage/output 目录，不迁移正式会话或工作流。保留原有会话授权、取消、Provider 校验与 revision 冲突行为。未调用真实 LLM、子 Agent 模型或外部搜索；未验证 codex-connect 对新版 DSH 的兼容性。

pnpm 11 自动记录了此次明确选定发布版本的 release-age 例外。正式 profile 仅允许已核对的 `dsh-subprocess-local`、`@google/genai`、`koffi`、`node-pty`、`protobufjs` 安装脚本；没有修改系统 PATH、全局 DSH 或系统运行时。

## 回滚

本轮修改前的清单、锁文件、pnpm 配置和 Web patch 备份位于 `<upgrade-backup>/`，子目录为 `runflow`、`enhanced-settings`、`web-profile`。README 与 RunFlow tsconfig 也在对应子目录备份。仓库内回滚应反向撤销本次兼容提交，并按旧锁文件重新安装、重建；Vitest 只撤销本次 `include` 增量，保留主线已有配置及 `maxWorkers: 4`，同时撤销 tsconfig 的对应增量。恢复外部 profile 备份时也不要覆盖后续改动，不需要删除 session、workflow 或 credentials 数据。

## Skill/Tool 状态

- 原生活跃：Shell、npm/pnpm、浏览器自动化 CLI、只读代码审查子代理。
- 兼容加载：测试、根因调试、完成前验证、代码审查与 Playwright SKILL.md 指令。
- OpenSpec：使用现有 CLI 1.11.0，`--tools none` 创建本地规格，采用 CLI 与手动产物流程；没有声称激活新 slash command。
- 内置回退：按附件自主决策和记录，未安装额外 Skill 或创建会丢失当前未提交功能的干净 worktree。
