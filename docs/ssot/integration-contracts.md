# 模块接入契约：只保留必要的解耦

状态：实施契约；已验证范围由各阶段报告单独登记，不能把整份契约视为已实现。服从[复用优先架构](reuse-first.md)。符号与源码依据见[证据表](upstream-evidence.md)。

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

`start` 返回已接受，`cancel` 返回已请求；都不代表完成。Worker 只上报 observations。App Server 在派发 Run 或替换 Session 时创建不可复用的 `runtimeBindingId`，绑定 Thread、Run、Worker generation 和 Session generation；wrapper/订阅闭包捕获该身份并随观察返回，等价的独立绑定通道也可。宿主验证通道与绑定后分配产品 seq，不以接收瞬间的 `currentRun` 补身份；Worker epoch 单独不足以区分同进程 Session 替换。Pi 原生事件不改造，绑定属于产品边界信封。旧观察不能进入新 Run；确已发生的迟到副作用应归原 operation 审计，不直接丢失事实。Session 切换与 Fork 经过 Pi runtime；替换后的 session 重新订阅、重新绑定 extension UI，不把旧实例事件串入当前 Thread。[P02]

Session 替换不是自动回滚事务：所核查的 Pi Runtime 先 teardown 旧实例，再创建新实例。[U01] 宿主在替换前保留最后可恢复的 nativeSessionRef，用公开失效/重新绑定回调管理有效性。失效前失败可保留仍有效旧实例；失效后 factory 失败进入 `session_unavailable`，禁止向旧 disposed 对象发送。新实例创建成功但 UI/订阅 rebind 失败时也先阻断新运行，清理不完整绑定后重试绑定或按原生引用恢复，不能制造双实例/双订阅。恢复仍走 Pi SessionManager/Runtime，不自行编辑原生历史。覆盖三种失败点：前置检查、旧实例失效后的创建、创建后的 rebind。

`AgentSessionEvent` 和工具详情可在 adapter 内直接使用；传往 UI 只暴露已脱敏、大小受限、可序列化的必要字段。保留 `source.type` 和未知事件的 diagnostic fallback，不以重写 Pi 的整个 event union 作为接入前置条件。

### 2.3 Operation 接缝

OperationContext 至少关联 `runId / toolCallId / operationId / runtimeEpoch / workspaceRef / parametersDigest / deadline`。该上下文由宿主生成或验证，不相信模型填入的许可。

同名工具 wrapper 捕获本次调用上下文，绑定公共工厂的 Operations；禁止用共享可变 `currentRunId` 或最后一个审批对象串联异步调用。公共 Operations 类型未必带齐业务字段，在 wrapper 闭包/明确的调用上下文中补，不更改上游工具 schema。

工具定义以公开 `create*ToolDefinition` 为优先入口，保留 `prepareArguments/constrainedSampling/executionMode` 与其余公开行为字段，只包装执行；内部工具包装源码仅为证据，不 deep-import。[U02][U03] 上游参数准备和校验只发生一次；摘要基于实际 execute 收到的最终结构，批准后若目标/参数改变须重新授权。wrapper 不自行实现 edits 的旧格式兼容，也不再重复 prepareArguments。

工具意图摘要与 Operations 派生的文件内容摘要分别存放。Operations 继承已绑定 operation，并检查其准许目标、截止时间、取消状态及读取版本/写入前置条件；不错误地要求写入内容 hash 等于工具输入 hash。前置 hash 只是冲突检测，不是跨外部编辑器的原子 CAS。

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

App Server 对产品事件分配 run 内单调 seq；按第 2.2 节的绑定拒绝错投/旧 Session 观察，不能只检查进程 epoch。快照包含已提交游标，实时订阅从该游标之后继续，处理快照和订阅之间的竞态。重放只恢复展示，不执行工具。

批次保存文本增量；最终消息与审批/状态要有持久边界。Pi 原生事件中 delta 与累计工具结果不同，adapter 按锁定版本保留语义。上游文档的 settled 语义需源码/真实探针确认，不能只检测字符串 `agent_end` 就宣布产品任务完成。[P13]

产品终态需满足：Pi 自动执行已结束、无未完成宿主操作、无悬挂审批；取消还需确认受管理执行已清理。若无法验证清理，保留异常/中断及残留信息，不假报 cancelled。崩溃发现未确认外部副作用时先对账；不可判定时 unknown，禁止盲目重发。

## 5. 资源管理接口

Package facade：列已配置/安装包、resolve、显式 install/remove/update、进度；尽量映射 Pi PackageManager 而非维护第二套包来源数据库。[P03] 产品额外存安装意图、批准/签名证据、不可变版本及作用域启用，不替代上游内部目录解析。

产品受管模式的审核/启用/目标版本由宿主权威维护，投影给 Pi Settings/PackageManager；后者复用来源解析和安装机制，不另作一套双向可写的产品激活状态。外部 CLI 修改只经显式导入或对账，冲突先显示，不能 last-write-wins。

固定 npm 版本的产品升级必须显式指定目标版：源码 `updateConfiguredSources` 会跳过 pinned npm，而 Git ref 的处理不同。[U04] 将检查新版、准备指定版本、校验、激活分开；上游显式 install 在受控新根执行，能力由 A3 先验证。准备/校验失败保留旧激活；有活动引用时保留旧目录；不在活动资源根原地 update。测试 pinned npm、Git ref、同包多版本/共享依赖、只配置未安装、离线缺包和失败回滚。

Skill facade：以 Pi Skill/diagnostic 为输入建立产品列表，只加 ID、来源、scope、启用、摘要。解析/formatSkillsForPrompt 留给 Pi；不在产品层再次拼所有 SKILL.md 正文进入 system prompt。[P04]

加载顺序必须是预先筛选源 → 固定资源副本 → Pi 解析/加载已批准项。不能先执行 DefaultResourceLoader.reload() 再移除不允许的扩展。独立 agentDir 也不能单独证明所有全局发现均被禁用，需要恶意全局/项目 fixture 验证。

### 5.1 相邻 Run 的资源切换

下一个 Run 进入 starting 后，先解析期望 ResourceLock，并与 Session 的实际 `loadedResourceLockId` 比较。一致才复用；不同则在 Pi settled、无宿主操作/审批时，使用所选 Pi 版本已验证的公开刷新或重建路径。确认实际加载成功后，在产品持久边界记录锁与绑定，再允许 start/prompt；数据库更新失败也不得启动。失败时显示期望/实际版本与阻断原因，保持不可运行状态，不能将新锁记成已生效或静默回退。任务启动前再核验绑定、取消和权限版本。

物化范围至少包含本次允许的包内资料、模板、脚本及运行依赖闭包；首版内容包可拒绝包外动态依赖，不必创造通用依赖运行时。禁止仅复制 SKILL.md 却继续读取源目录里的可变脚本。禁用技能应让后续 Run 的活动资源清单不再含它，但不自动擦除历史 transcript，工具授权仍独立执行。

验收：连续 A/B Run，A 始终使用旧快照，B 成功切换新版；禁用后 B 不加载；刷新/重建失败阻断；共享模板更改不污染 A。刷新若导致 Session 失效，适用第 2.2 节恢复契约。

A3 的 [限定证据](../validation/a3-2026-09-22.md) 已用实际 Pi reload 验证加载锁/快照和合成故障，用实际离线 npm/Git 验证新根准备。host settled/保存回调仍为合成测试，没有完成上述产品 Run/数据库事务、CLI 对账与活动引用管理；[默认加载器/安装边界](../validation/a3-boundaries.md) 必须继续保留。

## 6. 模型与凭据接口

用 `ModelRuntime` / pi-ai 提供模型目录、认证/刷新与请求协议。宿主适配公开 `CredentialStore`，不复制 Provider OAuth 协议。前端只收账户 ID/状态、模型展示字段与受控登录交互，不收原始 token。[P14]

CredentialStore 桥接成功也不代表 Pi Worker 永远接触不到凭据。需要向模型 Provider 发请求的进程可能使用凭据；受信任/隔离范围必须说明。Shell 子进程不继承所有账户环境变量。Keychain/DPAPI 适配、并发登录/刷新、退出前 flush 与错误脱敏需实测，不把 Pi 的文件存储直接称作系统密钥库。

A4 的 [限定实测](../validation/a4-2026-09-22.md) 已验证内存 store 与合成 Provider 的并发/取消、状态投影和环境隔离。所选版本的 CredentialSynchronizationError 表示变更已提交但本地同步失败，并可能携带原始 credential/cause；普通错误也不能证明未写入。宿主不得直接发送错误或盲目重试，应保留 committed_needs_sync/unknown 并对账。checkAuth 表示配置存在，不验证 token 有效；取消返回也不证明底层刷新已结算。系统存储/flush 及真实产品进程边界仍按 [A4 边界](../validation/a4-boundaries.md) 留待实施。

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

## 9. 接入验收的实施约束

具名用例见 [修订清单](review-fixes.md)，并落入 Backlog 的 `acceptanceCriteria`；`plannedChecks` 保留计划标识，实际覆盖以 `evidenceRefs` 的范围为准。`check-ssot.py` 通过不表示上述运行行为通过。

P0 的 CORE-03 必须保证同 Workspace 至多一个活动写 Run；M0 可先用全局单写 Run 的更保守准入。锁/准入由产品宿主负责，包含等待审批和取消清理阶段，只有停止核验或受控恢复后才能释放。Pi 文件级队列不冒充跨 Worker 锁；CORE-05 的 P1 仅扩展并发与 Worktree 管理。

## B 模块级实现边界（2026-09-22）

[最小契约](b-minimal-contract.md) 和 [限定证据](../validation/b-2026-09-22.md) 实现了产品创建/启动/取消/批准命令、宿主事务与全局单写、固定绑定、操作结算、持久 cursor 和真实 Markdown 索引；通过真实 Pi Session/Runtime/write 接入测试。snapshot/订阅/预览目前为宿主内部方法，资源激活和其他命令仍待实现，不表示第 2.1 节全部接口已开放。

测试在同进程组合模块，没有真实 Worker/IPC。取消和 unknown 的清理证据、崩溃输入为合成；产品库重开不会自动重新执行。完整资源锁/权限快照、真实退出确认与替换失败恢复仍按本契约实施。Node SQLite 的文件权限缺口及文件非原子检查见 [B 边界](../validation/b-boundaries.md)，不能从测试隔离推导出生产沙箱。
