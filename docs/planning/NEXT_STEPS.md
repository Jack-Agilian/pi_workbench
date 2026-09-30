# 从文档到可运行产品：复用优先

当前依据：[SSOT](../ssot/README.md)、[任务账本](backlog.json)。以下当前事项优先于后文历史阶段的“下一步”。

## 唯一当前事项：UI-P2 长历史与成果浏览体验

2026-09-30：用户授权后，develop 从 `148022b05250cfda824725778e9a056d00cd6830` 快进合入 `codex/agent-shell-mvp` 的20个提交，集成代码与证据基线为 `34ed62e3fc875c56059eb19c1f02781d72c78bfc`。M2、审核修复、Agent Shell、请求次数缺省不限与Pi strict schema修正现已进入同一集成分支；[本次集成检查](../validation/develop-integration-2026-09-30.md)。

按 [主功能/UI计划](AGENT_MVP_UI_PLAN.md) 的UI-P2推进，并采纳develop@58d3130审核的后端前置。当前阶段只此一项，前后端分工如下：

1. 后端 `codex/backend-history-safety` 已提交旧工作区重新准入、展示/控制消息分离、真实数据库历史/操作/成果分页与离线开发profile。代码 `45e45a5d598771c484926dd82d404f4242761185`，证据见 [后端报告](../validation/backend-history-2026-09-30.md)，接口以 [共享契约](../ssot/backend-history-contract.md) 和 [前端交接](BACKEND_HISTORY_HANDOFF.md) 为准。未合并develop，不修改其他工作树或Renderer。
2. 前端下一步采用同一契约，接入分页及独立活动/审批快照；改善右栏折叠/宽度、成果名称/来源和changed/missing展示。旧thread全量入口仍有1.2 MB上限，前端未切换前不能宣布长历史问题已解决；审批始终可发现，不抢焦点、不丢草稿。
3. 集成后集中完成三个既定窗口尺寸、长历史分页、审批/取消/草稿/重连回归。两线使用各自 `--dev-profile` 离线目录，GUI测试串行；不要用新增真实模型调用调试小改动。Pi循环、Provider、Session和审批所有权不变；PTY、Windows、市场和生产发行后置。

已有真实任务代码 `688150f070797405250bb16ad3dc837bb0ddc64d`；[真实结果与首次失败](../validation/agent-task-live-2026-09-30.md)、[脱敏输入](../validation/agent-task-live-inputs-2026-09-30.json)、[实际模型生成报告](../validation/agent-task-result-2026-09-30.md)。本次集成没有新增真实请求，以下仍为该次任务的历史消费与验证范围。

限定MODEL-03/04逐项done；M0-Pi补齐真实模型任务及Mac审批/取消/恢复证据后passed。M0-UI/M0-SDK沿用原passed，均不等于完整产品/通用沙箱/生产发布。真实任务走CLI→同DesktopHost/Worker产品链路，本轮没有重新声明Electron真实模型UI通过。

本轮gpt-6-luna新增10次LLM请求（正常7、拒绝1、活跃Shell取消1、原Session恢复1）；累计14次。历史账本和授权身份保留，累计保守预留$0.479584/$1。请求次数缺省不限，单LLM总期限30分钟、网络空闲5分钟；费用/数据/逐工具批准仍分别生效。实际账单未核验。

旧M1“4/4耗尽”和8次验证提案属于历史；不再作为产品次数门槛。测试限制与产品默认继续分离。历史/阶段报告的“下一步”不得覆盖本节。

以下仅为历史能力分解与阶段记录。

## 1. 下一增量不是再造平台

**M0-A：Pi 公开 API 接入探针 + 最小桌面/产品契约。**先证明能复用，再逐步连接 UI，不先编写独立 Agent Runtime、技能解析器或工具库。Mock 保留为确定性测试与演示手段，不能成为另一套算法或伪造真实 Pi 事件。

| 顺序 | 工作 | 复用/差异 | 验收 |
|---|---|---|---|
| A0 | 选定发布包与运行时 | 固定 Pi 发行版本、tarball/lock，核对 exports/Node；源码 0.86.1 仅候选 | 正确 Node 环境可 import 已用公开符号；不依赖 experimental source 条件 |
| A1 | SDK Session 探针 | createAgentSession/SessionManager/Runtime | in-memory/保存恢复/订阅替换；原生记录不被产品库重写 |
| A2 | 基础工具接缝 | Pi 同名工厂、Operations、截断/diff | 包装前后语义一致；拒绝不执行；无旁路；取消与context不串 |
| A3 | 受控技能和包探针 | Pi Skill/ResourceLoader/PackageManager | 未批准 factory 不执行；resolve 不隐式安装；包安装副作用审计 |
| A4 | 凭据与模型探针 | ModelRuntime + CredentialStore | 前端只收到状态；登录/刷新/模型目录不另写；无密钥进日志/env |
| B | 最小产品协调与持久化 | 自有Run/Operation/Approval/Artifact，其他交给Pi | 幂等、事件快照、取消清理和unknown状态；没有第二套Session树 |
| C | Electron/React工作台 | 定向选 pi-gui/OpenPi 组件，验证后局部移植 | timeline/composer/工具卡/审批/成果；新环境可启动，保留来源和许可 |
| D | Mac闭环 + Windows执行竖切 | 现成Shell/PTY库 + 必要OS监督 | 中文路径、终端resize、进程清理及应用退出；跨平台不靠字符串替换 |
| E | 本地技能库与精选目录 | Pi内容模型 + 产品启用/快照/安装事务 | 普通SKILL.md可导入，更新不改变活动Run；未知可执行插件不开放 |

A0–A4 是 BOOT-03 / CORE-02 范围内的小型可行性探针，不等于提前完成全部工具、包管理和安全工作项。生产级 CORE-04 仍需 BOOT-05 平台验证，PKG-01/02 的完整市场安装交付仍为 P1；探针只提前揭示依赖能否复用。

A0–A4 的无模型部分可以与 B/C 的 Mock 视图并行。真实付费模型调用须有账户与费用授权；不调用 Provider 的导出/资源/文件工具测试不能声称验证了模型行为。Windows不等Mac全功能完成才验证。

## 2. 暂定目录：减少不必要拆分

```text
apps/desktop/            # Electron/React
apps/agent-server/       # 一个模块化宿主，含产品/资源/审批/成果模块
packages/app-contracts/  # 可校验跨进程DTO
packages/pi-adapter/     # Pi公开SDK与Operations薄适配
packages/platform/       # OS/PTY/进程监督，依赖现成库
```

Mock/fixtures 先作为测试与开发入口。每个目录不必都成为独立发布包，不增加自研插件微内核、通用RPC生成器、Provider层或npm解析器。

## 3. 社区复用准入

`pi-gui` 优先考察 thin SDK driver、timeline/diff/terminal；`OpenPi` 优先考察 Customizations/资源配置与特权边界。只在固定提交、许可证和模块依赖核查后局部移植；不同时拼六套应用。Pi TUI组件不作为React组件使用。

Pi server/client/Chord/durable 按 [SSOT](../ssot/reuse-first.md) 记为评估项；发布、认证、持久化、平台和接缝能力证明前不替换SDK主路径，也不自研同功能框架。

## 4. 开工依赖与集成验收依赖

`dependencies` 表示开发前置；`acceptanceDependencies` 表示完成集成验收前必须完成的额外工作。Mock/接口可以提前并行，不能据此绕过实际 SDK/授权/平台验收。两类边的联合图必须无环，done 要有满足的前置与逐条证据。

CORE-04 的工具接缝验收增加 BOOT-03/CORE-02/SEC-02；SEC-03 的凭据验收增加 BOOT-03/CORE-02。CORE-03 的 P0 包含同 Workspace 写 Run 串行（M0 可全局单写）；CORE-05 仍是 P1 的并发/Worktree 扩展。R06 固定包升级在 A3/PKG 阶段验证，不阻塞 A0/A1，也不把所有实验候选的评估作为前置。

## 5. M0 分层验收（不是三套实现）

| Gate | 必须证明 | 不能推导 |
|---|---|---|
| M0-UI | Mock 桌面工作台、任务/审批/取消/恢复、真实 Markdown 文件；记录所测平台，主闭环在 Mac | 不代表 Pi 接入或模型调用 |
| M0-SDK | 真实发行包与完整性、公开导出、原生 Session、本地工具、受控资源/宿主接缝；可以不调用模型 | 不代表真实 Provider/模型行为 |
| M0-Pi | M0-UI 与 M0-SDK 后，获授权真实模型完成任务，含审批/取消/恢复及 Mac 平台证据 | 不代表未测 Windows、强沙箱或签名发布 |

状态独立记在 `backlog.json.milestones`，所需证据不齐保持 pending/blocked；M0 总闭环只有三个 Gate 均通过才算通过。不具备账户/费用/平台条件时仍可推进 UI 和无模型 SDK 测试，绝不把 Mock 结果晋级。Pi 加入后 UI 不改业务模型，原生 Session/压缩/模型协议继续由 Pi 负责。

每个PR列出“复用了什么 / 只新增了什么 / 对应证据与测试 / 尚未验证的平台”。文档检查、真实SDK、真实模型与平台E2E分别记录。未完成任务不得改为done；远端提交必须独立读回确认。

本轮修订范围及 planned 用例见 [R01–R08](../ssot/review-fixes.md)；可持续状态与证据规范见 [SSOT 维护](../ssot/maintenance.md)。

## 阶段记录：A0/A1（2026-09-22）

已固定 Node 24.21.0 / npm 11.19.0 / Pi 0.87.0；新增最小 `packages/pi-adapter`、显式应用初始化、离线探针和下载审计。严格 NodeNext 类型检查通过 [ADR-A0](../ssot/adr-a0-pi-types.md) 固定声明补丁与精确 MCP 类型 peer 解除阻塞，BOOT-03 改为 in_progress。CORE-02 仅推进 Session 绑定、替换和三类失败探针，仍为 in_progress；未完成产品 Run 归属。当前被测提交与证据见 [收尾报告](../validation/a0-a1-closeout-2026-09-22.md)，原始发行缺口和历史失败保留。

M0-UI、M0-SDK、M0-Pi 保持 pending。A0/A1 原交付停止在其限定范围；后续 A2 记录如下。

## 阶段记录：A2（2026-09-22）

继续采用 Pi 0.87.0 的公开 read/edit/write/bash 工厂与 Operations，新增每次调用的固定身份/批准快照、写入前置条件与隔离测试。19 项工具测试、4 项真实 macOS Bash 测试、A1 回归及新副本重跑通过，见 [实际证据](../validation/a2-2026-09-22.md)。CORE-04、SEC-02 从 proposed 推进到 in_progress，BOOT-03/CORE-02 仍 in_progress；前置任务和完整产品验收未被跳过。

辅助 I/O、非原子文件检查、宿主 executeBash 与未覆盖平台的限制见 [A2 边界](../validation/a2-boundaries.md)。A2 当时的交付止于工具探针；后续 A3/A4 和 B 的证据分别列于下文。三个 M0 Gate 继续 pending。

## 阶段记录：A3（2026-09-22）

A3 已在 Pi 0.87.0 验证受控技能快照/原生刷新 9 项，以及真实离线 npm/Git 安装 8 项，见 [报告](../validation/a3-2026-09-22.md)。缺包解析策略、默认加载器隐式安装、祖先发现和原地更新等限制见 [边界](../validation/a3-boundaries.md)。没有复制 Pi 的技能或包来源解析器。新副本独立初始化、外部 cwd 连续两轮通过。

SKL-01、PKG-01 仅进入 in_progress，完整产品启用、签名/撤销、活动引用管理和 CLI 对账仍待实施。BOOT-03 继续 in_progress，三个 Gate 仍 pending。A3 当时未包含 A4；后续凭据/模型探针的实际证据列于下文，仍未使用真实账户或 Provider。

## 阶段记录：A4（2026-09-22）

A4 使用真实 Pi 0.87.0 ModelRuntime/内存 CredentialStore 完成 16 项合成认证接缝测试：状态白名单、临时 key、刷新/登录/注销竞争、取消、提交后同步失败和目录发布；完整回归、重复初始化及新副本两轮通过，见 [报告](../validation/a4-2026-09-22.md)。[边界](../validation/a4-boundaries.md) 明确异常可能含密钥、取消不代表底层已结束、系统存储/flush 未实现；没有真实 OAuth 或模型调用。

SEC-03 进入 in_progress；BOOT-03/CORE-02 仍 in_progress，三个 M0 Gate 仍 pending。A4 当时的交付止于认证接缝；后续 B 已采用这些公开入口，没有另造 Session 树、认证协议或 Harness。

## 阶段记录：B 最小核心（2026-09-22）

[最小契约](../ssot/b-minimal-contract.md) 收敛了产品命令/身份/事务/事件和真实文件成果；采用固定 Node 的公开 SQLite 候选入口，没有新增依赖或重写 Pi 原生历史。17 项核心测试和 5 项 Pi 接入测试、全部前序回归、新副本两轮与重复初始化通过，见 [报告](../validation/b-2026-09-22.md)。BOOT-01、CORE-01、CORE-03、ART-01 进入 in_progress；B 及三个 M0 Gate 均未完成。

后续范围以本文顶部“当前唯一开发项”为准；本段仅记录 B 的模块级交付。

## 阶段记录：B-IPC（2026-09-23）

[进程契约](../ssot/b-worker-contract.md) 与 [实际证据](../validation/b-ipc-2026-09-23.md) 记录真实 App Server/监护器/Worker、同一审批链路、30 项混合检查和四场景驱动。代码先提交，完整回归在该真实 SHA 上执行。依赖、锁与声明补丁不变；全局单写、M0 同 provider 单账户约束不变。缺清理证据继续阻断，未确认副作用不重发，三个 M0 Gate 不晋级。

## 阶段记录：B-IPC 审核修正（2026-09-23）

[四项修正](../validation/review-b-ipc-2026-09-23.md) 在既有功能分支完成；冷恢复、历史成果、IPC 枚举和原生路径握手补入产品链路，复用 Pi 公开 SessionManager/Runtime。原 30 项未覆盖的缺口保留失败证据，当前 Worker 48 项通过。全局单写、同 provider 单账户、三个 M0 Gate 状态及本轮不实施 C 的停止点不变；唯一开发顺序仍以顶部为准。
