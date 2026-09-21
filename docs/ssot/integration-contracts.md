# 模块接入契约：只保留必要的解耦

状态：实施契约，尚非运行代码；服从[复用优先架构](reuse-first.md)。符号与源码依据见[证据表](upstream-evidence.md)。

## 1. 依赖与状态所有权

| 边界 | 可直接依赖 | 拥有的状态 | 不拥有 |
|---|---|---|---|
| Renderer | 产品 DTO / React / UI 库 | 可丢弃的 UI 展示 | Pi 实例、密钥、Node FS、产品库 |
| Electron host | Electron / 受限 IPC /系统接口 | 窗口、用户选目录、凭据桥 | Agent Loop |
| App Server | 产品库、政策、资源与成果模块 | Run、审批、操作意图、资源快照、产品事件 | 原生 Session 消息真相 |
| Pi adapter / Worker | Pi 公共导出和官方类型 | Pi Session、工具包装、Pi 原生队列映射 | 产品 SQLite、全局自由配置 |
| Platform adapter | Node/OS 库、node-pty 等 | 受管理命令/PTY/后端能力 | 模型重试、市场规则 |

首版共享一个小的可校验 DTO 包，不创建通用服务发现、依赖注入框架或所有 OS 的虚拟化文件系统。若需这类能力，先评估 Chord/Pi 实验层，或成熟已有库。[P09]–[P12]

## 2. 三类消息，不复制两套 API

### 2.1 产品命令

最小：`threads.create`、`threads.snapshot`、`runs.start`、`runs.cancel`、`approvals.resolve`、`events.subscribe`、`artifacts.preview`、`resources.list/setActivation`。

UI 发送输入、Thread、附件引用和选择；App Server 核验并生成 Run ID、Workspace 绑定、有效权限和 ResourceLock。客户端不能自行决定权限快照。命令请求关联 requestId；有副作用的产品创建/批准支持幂等键。不要以统一字符串 `executeAnything` 暴露整个平台能力。

产品偏好仅投影为 Pi 公共配置。不要把每一个 Pi 方法都重新发明一份同义 SDK。产品协议中不泄漏 Pi 对象、Promise、函数、AbortSignal 或非 JSON 值。

### 2.2 Worker 接缝

默认采用 SDK Worker，不同时实现独立 CLI RPC 后端。只需要 `open/restore`、`start`、`steer`、`cancel`、`snapshot/ref`、`close` 与订阅。适配器直接调用 `AgentSession` / `SessionManager` / `AgentSessionRuntime`。[P01][P02]

`start` 返回已接受，`cancel` 返回已请求；都不代表完成。Worker 只上报 observations；App Server 添加 runId/epoch/序号并结算产品状态。Session 切换与 Fork 经过 Pi runtime；替换后的 session 重新订阅、重新绑定 extension UI，不把旧实例事件串入当前 Thread。[P02]

`AgentSessionEvent` 和工具详情可在 adapter 内直接使用；传往 UI 只暴露已脱敏、大小受限、可序列化的必要字段。保留 `source.type` 和未知事件的 diagnostic fallback，不以重写 Pi 的整个 event union 作为接入前置条件。

### 2.3 Operation 接缝

OperationContext 至少关联 `runId / toolCallId / operationId / runtimeEpoch / workspaceRef / parametersDigest / deadline`。该上下文由宿主生成或验证，不相信模型填入的许可。

同名工具 wrapper 捕获本次调用上下文，绑定公共工厂的 Operations；禁止用共享可变 `currentRunId` 或最后一个审批对象串联异步调用。公共 Operations 类型未必带齐业务字段，在 wrapper 闭包/明确的调用上下文中补，不更改上游工具 schema。

工具预先授权后每次执行仍核验许可有效性、取消状态、目标和参数摘要。文件写入需冲突前置检查；读/写/命令适配本身仍需负向路径测试。保留上游工具的返回形状、prompt metadata、裁剪与 diff 行为。[P05][P07]

## 3. 队列只有一个责任主体

| 意图 | 责任主体 | 首版行为 |
|---|---|---|
| 当前任务中纠正方向 | Pi `steer` | 绑定当前 Run；不另起产品任务 |
| 当前 Agent 工作流内的跟进 | Pi `followUp` | 界面显式标记仍归当前 Run；不再同时写产品待运行队列 |
| 下一项独立任务 / 下次 Run | App Server | 当前任务结算后调用一次 start/prompt；不再同时塞入 Pi follow-up |
| Provider 重试、压缩后续行 | Pi | 不变成新产品 Run |

M0 默认只开放独立任务队列；steer 可以随后开放，followUp 在归属与结算测试通过后开放。无需先完成两套队列 UI。一个输入只进入其中一个队列，禁止双投递。[P02][P13]

## 4. 事件与恢复

App Server 对产品事件分配 run 内单调 seq；Worker generation/epoch 拒绝旧进程观察。快照包含已提交游标，实时订阅从该游标之后继续，处理快照和订阅之间的竞态。重放只恢复展示，不执行工具。

批次保存文本增量；最终消息与审批/状态要有持久边界。Pi 原生事件中 delta 与累计工具结果不同，adapter 按锁定版本保留语义。上游文档的 settled 语义需源码/真实探针确认，不能只检测字符串 `agent_end` 就宣布产品任务完成。[P13]

产品终态需满足：Pi 自动执行已结束、无未完成宿主操作、无悬挂审批；取消还需确认受管理执行已清理。若无法验证清理，保留异常/中断及残留信息，不假报 cancelled。崩溃发现未确认外部副作用时先对账；不可判定时 unknown，禁止盲目重发。

## 5. 资源管理接口

Package facade：列已配置/安装包、resolve、显式 install/remove/update、进度；尽量映射 Pi PackageManager 而非维护第二套包来源数据库。[P03] 产品额外存安装意图、批准/签名证据、不可变版本及作用域启用，不替代上游内部目录解析。

Skill facade：以 Pi Skill/diagnostic 为输入建立产品列表，只加 ID、来源、scope、启用、摘要。解析/formatSkillsForPrompt 留给 Pi；不在产品层再次拼所有 SKILL.md 正文进入 system prompt。[P04]

加载顺序必须是预先筛选源 → 固定资源副本 → Pi 解析/加载已批准项。不能先执行 DefaultResourceLoader.reload() 再移除不允许的扩展。独立 agentDir 也不能单独证明所有全局发现均被禁用，需要恶意全局/项目 fixture 验证。

## 6. 模型与凭据接口

用 `ModelRuntime` / pi-ai 提供模型目录、认证/刷新与请求协议。宿主适配公开 `CredentialStore`，不复制 Provider OAuth 协议。前端只收账户 ID/状态、模型展示字段与受控登录交互，不收原始 token。[P14]

CredentialStore 桥接成功也不代表 Pi Worker 永远接触不到凭据。需要向模型 Provider 发请求的进程可能使用凭据；受信任/隔离范围必须说明。Shell 子进程不继承所有账户环境变量。Keychain/DPAPI 适配、并发登录/刷新、退出前 flush 与错误脱敏需实测，不把 Pi 的文件存储直接称作系统密钥库。

## 7. 扩展 UI 与插件生态边界

可绑定 Pi 现有 `ExtensionUIContext` 的 confirm/select/input/notify 等交互；危险操作审批仍由宿主 Policy 决定，而不是把所有插件弹窗都当授权。TUI `custom()`/renderer 不能直接复用为 React；不提供通用任意 JS 注入。先支持内置/选编工具和数据型技能。[P05]

官方 server/client/Chord 为未来 transport/service/state 复用候选，先验证安装与公开导出、认证与进程/线程绑定、macOS/Windows 传输及 SDK 资源/工具可控制性；通过才替换传输实现，不改变产品数据所有权。[P09]–[P12]

## 8. 接缝验收（不是重测整个 Pi）

- 重复 start 不创建第二个 Run；独立队列与 Pi follow-up 不双投递。
- 同名工具包装保持 read/edit/bash 输出与错误语义；禁用原工具旁路；拒绝审批零执行。
- 两个并行 toolCallId 不串 context；取消后不派发新操作；未确认清理不报已停止。
- 旧 Session/Worker 观察不能污染当前 Thread；Fork/切换后只订阅新实例。
- 未批准全局/项目扩展从未执行；resolve 不隐式安装；更改原技能文件不改变活动快照。
- Package 安装脚本/路径/依赖/失败事务行为被验证；产品更新不改变活动 Run。
- 凭据不进入 Renderer/日志/Shell 环境；Linux 单测不能代替两平台实测。
