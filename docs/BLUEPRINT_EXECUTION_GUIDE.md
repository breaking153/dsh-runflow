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

## 多个 Trigger 共用逻辑

在 Blueprint 模式中，多个 flow 输出可以连到同一个操作的 flow 输入。每次到达都会单独调用该操作，输入保持单次调用的值。两个 Trigger 都触发时，共用操作运行两次。兼容模式保留旧 DAG 的单值限制，以及旧状态图的数据聚合规则。

如果需要等待并行分支，使用显式 `control.join`。Join 汇合同一次调用的分支，不把不同 Trigger 的调用混在一起。数据输入仍遵守端口的单值或多值声明。

HTTP 的典型连接是：

```text
Trigger A ──flow──┐
                 ├─ HTTP ──flow── Storage ──flow── 后续操作
Trigger B ──flow──┘     └──body──→ input
文本常量 ──value──→ HTTP 的 URL 属性输入
```

操作只在 flow 到达时运行。若数据依赖来自尚未执行的操作，会报告缺失数据，不能通过一条数据线隐式重复请求 HTTP。失败的操作不会发出成功完成信号。

## 自定义节点兼容

节点描述支持 `executionKind: 'trigger' | 'pure' | 'effect'`。未声明的外部节点按 Trigger 分类或保守的操作规则处理，不根据“数据”分类自动认定无副作用。纯节点应遵守只计算返回值的约定。

操作可以声明 `completionPort`，指向自身的 flow 输出。运行时在成功返回后补充完成信号，同时保留原有数据返回值和显式返回的端口。旧端口 ID 与首个端口顺序保留，便于原有省略端口的连线继续解析。

已有脚本如果依靠数据线启动下游，请保留兼容模式，或补齐显式 flow 后再切换 Blueprint。外部系统的重试和幂等性仍由节点实现及其配置决定。

实际检查与限制见 [验证报告](./BLUEPRINT_EXECUTION_REPORT.md)。
