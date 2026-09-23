# 复用优先架构

状态：当前实施基线；实现与兼容验证未完成。日期：2026-09-22。

## 1. 首要原则

本产品是 **Pi 的桌面工作台及工作流产品层**，不是另一个 Agent Harness。顺序固定为：公开包 API → 官方扩展点/Operations → 已有社区模块 → 有来源的局部移植 → 最后才是自研。发现缺口须记录复现、候选实现和不采用原因，不能把“需要解耦”作为复制全部上游功能的理由。

Pi 的公开入口已导出 `AgentSession`、`SessionManager`、`ModelRuntime`、`SettingsManager`、`DefaultResourceLoader`、`DefaultPackageManager`、技能加载器及工具工厂。[P01][P02][P03] 本文所有 `[Pxx]`、`[Cxx]`、`[Lxx]` 见[证据表](upstream-evidence.md)。逐能力的执行清单见 [reuse-map.json](reuse-map.json)。

公开导出不等于永不变化；本次只确认源码存在。代码接入前必须检查实际发行包的 `exports`、声明文件、Node 要求、依赖锁和跨平台行为。禁止生产 deep-import `src/core/*` 或依赖 `experimental` 入口而不显式评审。

## 2. 复用分级

| 级别 | 使用方式 | 约束 |
|---|---|---|
| D：直接依赖 | 通过公开包入口调用 | 不复制源文件，不建立平行实现 |
| A：薄适配 | 保留上游算法/协议，只注入配置、Operations、事件映射 | 适配层局部依赖 Pi 类型，产品协议不依赖 Pi |
| C：局部移植 | 从社区工程选择可独立抽出的组件/测试 | 必须固定提交、核查许可证、保留归属、写差异和升级记录 |
| E：先验证 | 实验性、发布状态未证实或与当前框架有冲突 | 不列入主路径，先小型探针 |
| O：产品自有 | 上游没有的产品语义或权限边界 | 尽量基于标准库/成熟依赖实现，不另造通用框架 |

D/A 是默认；C/E 不是承诺已经兼容。库自身的来源、版本、适用范围和未测项要可见。

## 3. 直接依赖 Pi，不重写什么

| 能力 | 默认复用 | 产品只补充 |
|---|---|---|
| Agent Loop / 自动工具轮次 | `createAgentSession` / `AgentSession`，间接使用 pi-agent-core | Worker 监督、事件映射、产品 Run 结算 |
| Session 保存、树、恢复、Fork | `SessionManager`；切换/替换用 `AgentSessionRuntime` | Thread 与原生 Session 的绑定、可重建展示索引 |
| 压缩、重试、上下文装配 | AgentSession 原生机制 | UI 状态、预算/执行政策，不另造摘要循环 |
| 模型、Provider、登录/刷新 | `ModelRuntime` 与 pi-ai | 桌面登录交互、账户选择、`CredentialStore` 宿主适配 |
| Pi 设置 | `SettingsManager` | 产品设置单独存储；显式隔离 agentDir 和项目配置 |
| 技能 | `loadSkillsFromDir` / `loadSkills` / `formatSkillsForPrompt` | 已批准目录、个人副本、快照、启用范围、诊断展示 |
| Prompt、上下文和扩展发现 | `ResourceLoader` / `DefaultResourceLoader` | 安装版本白名单；禁止加载后再过滤可执行扩展 |
| Pi 包解析/安装/配置列表 | `DefaultPackageManager` / `PackageManager` | 产品安装事务、签名/撤销/批准、版本快照 |
| 基础工具 | `create*Tool` / `create*ToolDefinition` 与 `*Operations` | 宿主审批与审计、后端差异、全进程清理 |
| 单次 edit 结果与输出裁剪 | Pi 返回的 patch/diff、`truncateHead/Tail/Line` | 桌面 diff 视图、Blob 大日志、来源与版本 |
| 运行中的插话 | `steer` / `followUp` 与 Pi 队列 | 明确 UI 意图和消息归属，不复制相同队列语义 |

依据：[P01]–[P07]、[P13]。`AuthStorage` 不是本次推荐的公开主入口；按当前 `ModelRuntime` + `CredentialStore` seam 接入，不照搬旧文章的内部导入路径。

Pi 仍是 Session 内容的唯一所有者。SQLite 只存产品项目、Run、审批、成果、安装/授权及展示索引。不要编辑两份独立的模型消息历史。原生模型重试不是新产品 Run；下一个独立用户任务才进入产品队列。

## 4. 基础工具：包装原工具，而不是新造同义工具

首版维持模型侧的 `read`、`edit`、`write`、`bash` 或 `powershell`，以及按需启用的 `grep/find/ls` 名称、参数和结果语义。工具卡可以显示“读取文件”“执行命令”，没有必要把模型接口统一改名为 `shell` 或 `read_file`。

```text
Pi 的模型调用
  → 同名、受控的工具包装器（保留 schema、description 和 prompt metadata）
  → 本次调用的 OperationContext / 审批
  → Pi 工具实现（匹配、裁剪、diff 等不复制）
  → 注入的 Read/Edit/Write/Bash/PowerShell 等 Operations
  → 宿主执行设施或已验证的隔离后端
```

官方文档提供同名覆盖、远程 Operations 以及 SSH 示例。[P05][P07] 默认从公开 `create*ToolDefinition` 保留完整定义，仅包装 execute/注入 Operations，避免从 `AgentTool` 的少数字段重建后丢失行为。特别保留 `prepareArguments`、`constrainedSampling`、`executionMode`、schema、description、prompt metadata，以及锁定版本新增的公开行为字段；TUI renderer 留在 Worker，不序列化给 React。[U02][U03] 包装器须保留输入输出、增量回调、错误语义和取消信号；覆盖后验证只有一个有效工具实现，不能同时留下可绕过的默认工具。`createAgentSession({ tools })` 在核验源码中使用名字列表，不是 Tool 实例数组。[P02]

审批要绑定具体工具调用及经过上游一次准备、归一化和校验后实际 execute 接收的参数；不要复制参数兼容逻辑。派生文件内容 hash 与工具意图摘要分别管理，Operations 继承同一操作上下文，不把二者直接比较。文件 hash 前置检查用于冲突提示，不承诺针对外部编辑器的 OS 原子 compare-and-swap。[U02][U03]Operations 路由不等于所有 Node I/O 都已被重定向，尤其需审计路径解析、临时日志、图片处理等工具辅助路径。未通过安全覆盖验证的工具应禁用，而不是声称整个 SDK 已在沙箱内。

自有执行层只补批准检查、跨 Worker 互斥、受管进程树、平台能力探测等差异；不用自行复制文件搜索、编辑匹配、输出截断、Shell 语言或 PTY 实现。`withFileMutationQueue` 可覆盖其原有范围，不能当作跨进程/跨项目的锁。[P01]

## 5. 技能库与市场：Pi 内容模型 + 产品治理

### 5.1 本地技能库

沿用 `SKILL.md` 及 Pi 诊断/名称规则。流程：用户选择源 → 安全路径/内容策略 → 固定副本 → 调用 Pi 加载器 → 资源预览/诊断 → 产品作用域启用 → Run 引用快照。额外的品牌、分类、审核和权限元数据单独放在产品元数据中，普通 Pi 技能不因缺少专用 manifest 而被拒绝。[P04]

资源启用的四个阶段仍独立：安装、启用、授权、加入 Run。使用摘要寻址或受控不可变副本；只记录旧 hash 却继续读取可修改目录不算版本锁。升级默认仅影响下个 Run。相邻 Run 需比较期望锁与实际加载锁，在 settled 边界通过已验证的 Pi 刷新/重建路径确认新版生效后才启动；失败须阻断，不能写了新锁却继续旧资源。快照覆盖包内所需模板、资料、脚本；包外可变依赖须拒绝或独立批准，禁用不清除 transcript 中已有文本。具体流程见模块契约第 5 节。

### 5.2 包与市场

Pi 的 `package.json.pi` 资源入口及 npm/git/local 来源优先复用，不创建第二种必须使用的分发格式。已有快照中的 `workbench.plugin.json` 改为可选产品元数据示例，不是普通内容包强制入口；该决定不改写历史示例。[P03][P06]

首版市场是精选 catalog + 现有分发源 + 本地 Package facade。Package facade 调用已验证的 `DefaultPackageManager` 能力并增加产品审核/激活事务；不要自己实现 npm semver 解析器、Git URL 解析器或整套依赖安装器。进度事件用于 UI。产品的“升级到指定版本”不直接映射为 `update()`：核查源码跳过固定版本的 npm 条目，固定 Git ref 又有不同处理。[U04] 应先明确目标版本/摘要，复用显式安装能力在受控新根准备，验证后切换后续 Run 的激活记录；目录与副作用控制能力先由 A3 探针证明，不能在活动快照上原地升级。产品受管模式以宿主激活记录为准，Pi 包列表是投影；外部 CLI 变化显式导入/对账，不做双向 last-write-wins。

**只有验证过副作用边界的安装路径才启用。**审计锁定版本的 npm/git/本地分支、依赖解析、安装脚本、生命周期、缺失来源处理和离线行为。上游已有供应链措施，不能沿用“它必定执行所有 npm scripts”的未经核实断言；同样不能仅因使用官方安装器就认为满足本产品规则。[P03][P08]

运行中的 ResourceLoader 禁止隐式安装缺失包；缺失来源应 skip/error 并由产品安装流程显式处理。解析器可复用，是否加载/安装由产品决定。检查必须发生在加载扩展之前，因为扩展 factory 本身可执行代码。[P05]

精选内容包优先；开放代码扩展仍推迟至隔离和审核就绪。不要为第一版建设支付、推荐系统、自研包服务器或自研插件微内核。

## 6. UI、终端与代码审查

Pi 根入口导出的 `AssistantMessageComponent`、`ToolExecutionComponent` 等是终端交互组件，不能当 React 组件直接使用。[P01] 复用它们的语义/状态处理，不把 TUI 渲染引擎搬到浏览器。

| 参考 | 计划复用方式 | 不照搬的部分 |
|---|---|---|
| `minghinmatthewlam/pi-gui` | 优先评估 `packages/pi-sdk-driver`、timeline、工具卡、Composer、diff/terminal 与测试 | 不默认共享用户全局凭据和全部扩展；不采用未经验证的并行写入假设 |
| `heyhuynhgiabuu/openpi` | 定向借鉴 Customizations 页、设置、文件/Git/终端交互和权限边界测试 | 当前 README 将 SDK 放在 Electron main，不能误称其已有独立 sidecar；本项目保留 Worker 隔离 |
| xterm.js + node-pty | 终端显示与 PTY 生命周期依赖现成库 | 不等于安全沙箱，不自动证明所有进程都已取消 |

依据：[C01][C02][L01][L02]。社区 UI 最初仅做 README 级选型；C 已按 [固定来源/MIT/测试](../validation/c-desktop-2026-09-23.md) 局部移植键盘保护，其余组件仍待评估。不直接 import 别人的应用内部目录，不复制未核查模块；后续移植同样需 commit、LICENSE、源文件列表、修改清单和回归。原有其他参考项目留作候选，不再同时拼装六套 UI。

单次工具 edit 的 patch 用 Pi 的结果；整个分支/工作区变更用 Git 自己的 diff，不能只拼接工具输出冒充工作区实际状态。显示器可以复用社区组件；Git 工作流策略和审批归产品。

## 7. 官方新模块先评估，不重复造通用框架

本次源码还包含 `pi-server`、`pi-client`、`pi-protocol`、Chord 和 `pi-durable`。[P08]–[P12]

- `pi-server` / `pi-client` 自称 experimental，提供路由、附件绑定与服务订阅。先探测能否减少自有传输代码；默认 SDK 主路径不切换。服务发现/会话管理仍由应用提供，Unix transport 不实现 peer authentication。不能把该组合称为可直接替代产品 App Server 的成品。
- Chord 已提供服务、生命周期与复制状态，不应自研一个同功能插件总线或状态复制框架。M0 若普通模块调用和现成 IPC 足够，不必主动引入整个 Chord；出现通用需求时先评估公开 API。
- `pi-durable` README 当前仅承诺 durable 记录契约和脱离进程的内存存储实现。不能因此删掉磁盘恢复/SQLite需求，或假定已是可直接生产使用的桌面持久化层。

E 类评估失败时记录具体缺口，不派生一套模仿 Pi 的新平台。只在有真正产品需求的地方补最小接口。

## 8. 自有模块缩减到产品增量

```text
apps/desktop/           Electron main/preload/React
apps/agent-server/      一个模块化 Node 宿主：产品状态、审批、资源、成果
packages/app-contracts/ 跨进程可校验的产品 DTO；不复制 Pi 所有类型
packages/pi-adapter/    唯一的 Pi 运行时依赖边界、SDK/工具/资源薄适配
packages/platform/      现成 OS/PTY 库的封装与监督
```

Mock 放在测试/演示适配器中，不变成第二套 Harness。skills、packages、policy、artifacts 首版可为 App Server 内模块；根据团队/依赖边界再拆独立包，不因画了一个方框就创建微服务。

App Server 是产品 coordinator，不拥有模型轮询、重试器、Prompt 模板引擎或 Session 消息树。Pi 类型允许在 `pi-adapter` 内部和其测试中直接使用；仅在真正跨进程和产品持久字段上转换，避免每层重复映射同一工具结果。

## 9. ADR-R01：替代与保留

| 原草案方向 | 当前决定 |
|---|---|
| 自有 read_file/write_file/edit_file/shell 套件 | 同名 Pi 工具包装 + Operations，新增 artifact/connector 等真增量工具 |
| 自研 Skill 解析/Prompt 引擎 | Pi 加载器负责原格式；产品只补安全范围/快照/启停 |
| 完整自研包解析与安装器 | 优先 PackageManager；安装治理是上层事务，不是重做 npm/git |
| 全套自定义原生会话/消息结构 | 原生 Session 真相保留 Pi；产品索引可重建 |
| 先定义巨大通用 Runtime，再后接 Pi | 公开 API 导出探针先行，薄 Adapter 与 Mock 测试并行 |
| 为所有服务分独立 package/process | 模块化单体；只有必要的宿主/Worker/预览进程边界 |
| 默认忽略 Pi server/client/Chord | 记录 E 类评估及晋级门槛，不无条件采用实验体系 |

继续保留：UI 无直接特权；默认不自动加载未知扩展；产品权限与操作审计；任务取消/恢复；Artifact 真文件验证；macOS 主闭环 + Windows 早期执行验证；不宣称本机审批是强沙箱。

## 10. 准入与防止再次造轮子

每项新增能力在 PR 中回答：上游公开入口是什么？本次只补什么？为什么现有能力不能满足？使用了什么测试？源版本/许可和未验证平台是什么？

复用不代表零测试：验收应集中在我们的接缝——受控资源加载、同名覆盖、Operations 逃逸、Session 替换订阅、凭据泄漏、升级兼容、进程清理——而不是把 Pi 自己的所有单元测试和实现复制进仓库。首个真实 Pi 探针不依赖完整 UI，可先通过安装/导出/受控加载测试，再在明确账户与费用许可后做最小模型调用。
