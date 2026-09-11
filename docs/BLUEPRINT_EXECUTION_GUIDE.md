# Blueprint 节点与属性输入

新建工作流默认使用 Blueprint 执行语义。已有流程保持兼容模式；可以在 **运行设置 → 执行语义** 中明确选择。切换后应检查执行连线，数据连线本身不再启动 HTTP 等操作。

## 三类节点

| 类型 | 用途 | 连线规则 |
| --- | --- | --- |
| Trigger | 启动一次调用 | 从输出 flow 开始连接操作 |
| 操作 | HTTP、Agent、写入文件、修改状态、脚本、等待 | 输入 flow 启动，成功完成后输出 flow；分支、暂停、结束节点按自己的控制规则执行 |
| 纯数据 | 文本、数字、布尔、JSON 常量、转换、读取状态 | 不需要 flow，使用它的操作执行时才计算数据 |

这借鉴了 Unreal Blueprint 的 [Pure / Impure Functions](https://dev.epicgames.com/documentation/en-us/unreal-engine/functions-in-unreal-engine) 和[执行线与数据线](https://dev.epicgames.com/documentation/en-us/unreal-engine/nodes-in-unreal-engine)的区分。写状态仍然是操作；提供常量或读取数据可以没有 flow。

`value.text`、`value.number`、`value.boolean`、`value.json` 用于提供类型明确的常量。`state.get` 按路径读取当前调用看到的状态，不修改它；`state.read` 保留有执行顺序的读取方式。纯节点的结果不会跨后续调用或循环轮次永久缓存。

## 把属性变成输入引脚

1. 选择节点，在属性旁点击 **转为输入**。
2. 将类型匹配的数据输出拖到新增引脚。
3. 属性栏保留默认值；未连接时使用默认值，已连接时使用该次调用的数据。
4. 点击 **还原属性**，或已连接时的 **断开并还原**，恢复普通属性；一次撤销可以恢复引脚和连线。

`false`、`0`、空字符串以及字段允许的 `null` 都是有效输入，不会被默认值替代。支持的属性由节点配置声明决定；重试、超时与 Trigger 入口配置不作为运行时属性输入。这里的 Promote 是“将属性暴露为输入”，与 Unreal 的 Promote to Variable 命令有所区别。

## 断开引脚连线

将鼠标移到引脚上或让引脚获得键盘焦点，按 **Delete / Backspace**，即可一次断开该引脚的全部连线。也可以右键引脚，在菜单中查看数量并选择 **断开 N 条连接**。文本框内的删除键仍用于编辑文字。

这两种操作只断开连线，保留节点和端口。Promote 引脚仍然存在，断开后恢复使用保存的默认值；一次撤销会恢复整批连线。如果还要移除 Promote 引脚，使用属性旁的 **还原属性** 或 **断开并还原**。

从已连接引脚拖到画布空白处，会打开兼容节点选择器，并提示原有连线数量。后续行为取决于选择：

| 操作 | 结果 |
| --- | --- |
| 关闭或取消选择器，不选择节点 | 断开开始拖动时该引脚已有的连线，可一次撤销 |
| 选择兼容节点 | 创建节点并追加连接，保留原有连线 |
| 拖到不兼容的引脚等错误目标 | 拒绝本次连接，保留原有连线 |

## 多个 Trigger 共用逻辑

所有执行模式都允许不同的 flow 输出连接同一个 flow 输入，包括声明 `multiple: false` 的 flow 引脚。增加连线不会修改 Workflow 的执行模式或语义；多条连线如何触发节点仍由当前模式决定。

| 执行语义 | 多路 flow 到达后的行为 |
| --- | --- |
| Blueprint | 每次到达独立调用，共用操作收到该次调用的值；两个 Trigger 都触发时运行两次 |
| 兼容 DAG | 保持一次拓扑执行，不因新增来源而变成多次独立调用 |
| 兼容状态图 | 同一轮仍执行一次；后续轮次按原有状态图规则调度 |

兼容模式中，flow 输入声明 `multiple: false` 时使用该轮最后一个输入值，`multiple: true` 时保留聚合值。这是 flow 的多入接规则；数据输入仍遵守原有单值或多值约束。画布和 Host 都会拒绝相同源节点、源引脚、目标节点、目标引脚的重复连接。

如果需要在 Blueprint 中等待并行分支，使用显式 `control.join`。Join 汇合同一次调用的分支，不把不同 Trigger 的调用混在一起。

HTTP 的典型连接是：

```text
Trigger A ──flow──┐
                 ├─ HTTP ──flow── Storage ──flow── 后续操作
Trigger B ──flow──┘     └──body──→ input
文本常量 ──value──→ HTTP 的 URL 属性输入
```

在 Blueprint 中，操作只在 flow 到达时运行。若数据依赖来自尚未执行的操作，会报告缺失数据，不能通过一条数据线隐式重复请求 HTTP。失败的操作不会发出成功完成信号。

## 模型与枚举配置

Agent 节点的 **Model Provider**、**Model ID** 和 **Reasoning Effort** 从当前 Host 的官方模型目录读取下拉选项；模型列表随 Provider 更新，推理强度随所选模型公布的能力更新。目录没有公布的能力不会被当成已支持。

- 留空表示运行时继承父 Agent 或模型默认值。下拉框中展示的当前 Provider / Model 只是继承提示，不会把当前值写入 Workflow。
- 切换 Provider 会清除旧 Model 和 Reasoning Effort；切换 Model 会清除旧 Reasoning Effort，避免携带上一个模型的选项。
- 自定义值仍可输入。保存过但不在当前目录中的历史值会明确标识并保留，避免打开属性面板就丢失配置；保留值不代表当前 Host 一定支持它。

HTTP 的 Method 选项包括 `GET`、`POST`、`PUT`、`PATCH`、`DELETE`、`HEAD` 和 `OPTIONS`。条件等枚举属性按节点 schema 提供选择，包含 `lessThan`；现有自定义或历史配置值仍明确保留。执行时仍以 Host 校验和实际 Provider 能力为准。

这轮改动的检查结果与覆盖范围记录在[节点复用报告](./NODE_REUSE_REPORT.md)，历史 Blueprint 验证保持原有日期和范围。

## 自定义节点兼容

节点描述支持 `executionKind: 'trigger' | 'pure' | 'effect'`。未声明的外部节点按 Trigger 分类或保守的操作规则处理，不根据“数据”分类自动认定无副作用。纯节点应遵守只计算返回值的约定。

操作可以声明 `completionPort`，指向自身的 flow 输出。运行时在成功返回后补充完成信号，同时保留原有数据返回值和显式返回的端口。旧端口 ID 与首个端口顺序保留，便于原有省略端口的连线继续解析。

已有脚本如果依靠数据线启动下游，请保留兼容模式，或补齐显式 flow 后再切换 Blueprint。外部系统的重试和幂等性仍由节点实现及其配置决定。

实际检查与限制见 [验证报告](./BLUEPRINT_EXECUTION_REPORT.md)。
