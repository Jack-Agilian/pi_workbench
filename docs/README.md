# 文档导航

**使用版本：用户重新上传的 Pi Workbench Startup Pack v0.1。**完整原包保存在 `startup/`，其内层 `docs/` 是原包目录结构，保留它是为了不破坏引用、测试路径和 SHA-256 清单。

## 当前实施基线

前端设计：[空间与控件规格树](ssot/ui/README.md) · [项目开发Skill](../.agents/skills/workbench-ui-design/SKILL.md)；设计标准不等于界面已实施。

2026-10-08最新：[可交互的完整流程原型](design/workbench-prototype/README.md) · [规格v2验证与未覆盖范围](validation/ui-prototype-2026-10-08.md)。承接[70项控件社区审核](validation/ui-control-audit-2026-10-08.md)，已纠正输入区审批、文档阅读主次与目录对象；下一步成组实施正式UI。合成原型不代表产品链路通过。

**[复用优先 SSOT](ssot/README.md)** · [架构与替代决策](ssot/reuse-first.md) · [模块接入](ssot/integration-contracts.md) · [上游证据](ssot/upstream-evidence.md) · [复用清单](ssot/reuse-map.json) · [模块到参考实现的映射](ssot/reference-implementations.md)

当前设计不再把 Pi 已提供的 Session、工具、模型、技能解析和包管理列为自研引擎；自有实现聚焦产品治理和桌面体验。`ssot/` 指定的替代范围优先于原始快照。

当前 UI：[10月8日原生接续复验](validation/native-daily-review-2026-10-08.md) · [整体验收核对/接续操作清单](validation/daily-readiness-2026-10-04.md) · [跨会话执行入口](validation/cross-thread-2026-10-04.md) · [布局缩放与日常体验复审](validation/experience-review-2026-10-04.md) · [复制与成果操作](ssot/reading-actions-contract.md) · [复制/成果验证](validation/reading-actions-2026-10-04.md) · [会话查找契约](ssot/thread-directory-contract.md) · [目录实测](validation/thread-directory-2026-10-04.md) · [工作流复审与恢复](validation/workflow-review-2026-10-04.md) · [安全正文阅读](ssot/safe-reading-contract.md) · [阅读实测](validation/safe-reading-2026-10-04.md) · [会话持久命名](ssot/thread-naming-contract.md) · [整体重构与验证](validation/ui-refactor-2026-10-03.md) · [界面与权限模式边界](ssot/ui-experience-contract.md)。

2026-10-03 UI 首轮交付复审（历史）：[社区前端布局研究与开源复用建议](validation/desktop-ui-research-2026-10-03.md) · [当前布局审核、交叉质疑与建议顺序](validation/ui-layout-review-2026-10-03.md)。仅研究/审核，未实施新布局。

## 原始产品与技术规格（历史快照）

| 专题 | 文档 |
|---|---|
| 产品定位与 P0 范围 | [01 产品章程](startup/docs/01-product-charter.md) |
| 进程边界、运行时与存储 | [02 系统架构](startup/docs/02-system-architecture.md) |
| 工作台、Composer、审批和成果 | [03 UI 与交互](startup/docs/03-ui-and-interactions.md) |
| 安装、权限、签名、更新与撤销 | [04 插件市场](startup/docs/04-marketplace-and-plugins.md) |
| 技能启停、范围、版本锁和测试 | [05 技能库](startup/docs/05-skill-library.md) |
| 连接器、专家、成果与自动化 | [06 工作能力](startup/docs/06-workflows-and-artifacts.md) |
| Shell、进程树、沙箱与发布 | [07 跨平台与安全](startup/docs/07-platform-and-security.md) |
| 参考项目、28 项 Backlog 与 Gate | [08 实施与参考](startup/docs/08-delivery-and-references.md) |
| 一手来源与历史核验范围 | [09 来源与核验](startup/docs/09-sources-and-verification.md) |

[Word 启动手册](startup/Pi_Workbench_Startup_Handbook_v0.1.docx) · [架构决策](startup/adr/decisions.md) · [产品协议](startup/contracts/app-protocol.ts) · [数据库草案](startup/contracts/initial-schema.sql) · [技能示例](startup/examples/weekly-report/README.md)

## 本次新增的工程准备

[开发与初始化](DEVELOPMENT.md) · [导入记录](IMPORT.md) · [初始导入验证记录（历史）](VALIDATION.md) · [下一步开发路线](planning/NEXT_STEPS.md) · [结构化 Backlog](planning/backlog.json)

原包发布日期、依赖候选版本和原始测试报告均按历史资料处理。2026-09-21 的新核验与实施决策见 `ssot/`；没有恢复后一套未上传的 Pi Desktop 专题资料。

当前修订记录：[R01–R08 修订与验收边界](ssot/review-fixes.md)。每次测试的即时输出位于 `.artifacts/`；历史报告不代表当前提交、Pi 接入或目标平台验证。

A0/A1 当前记录：[严格类型修复与收尾验证](validation/a0-a1-closeout-2026-09-22.md)；[首次发行包与 Session 探针](validation/a0-a1-2026-09-22.md) 保留历史失败。包含被测提交、字节完整性、声明补丁与 macOS 证据，不代表完整 M0-SDK 或模型验收。

A2 当前记录：[工具接缝与真实 macOS Shell 验证](validation/a2-2026-09-22.md) · [采用边界](validation/a2-boundaries.md) · [输入摘要](validation/a2-inputs.json)。CORE-04/SEC-02 仅推进探针范围，完整产品验收和三个 M0 Gate 仍待完成。

A3 当前记录：[受控资源与包探针](validation/a3-2026-09-22.md) · [公开入口和隔离边界](validation/a3-boundaries.md) · [发行包及测试输入](validation/a3-inputs.json)。SKL-01/PKG-01 进入 in_progress，完整技能库/市场及 M0 Gate 未完成。

A4 当前记录：[凭据与模型探针](validation/a4-2026-09-22.md) · [错误/取消/系统存储边界](validation/a4-boundaries.md) · [发行输入摘要](validation/a4-inputs.json)。16 项合成认证接缝通过，SEC-03 仅进入 in_progress；真实 OAuth、系统密钥库和 M0 Gate 尚未完成。

B 模块级阶段记录：[最小产品核心验证](validation/b-2026-09-22.md) · [产品契约与 SQLite 采用决定](ssot/b-minimal-contract.md) · [文件权限/恢复边界](validation/b-boundaries.md) · [输入摘要](validation/b-inputs.json)。17 项核心和 5 项 Pi 接入测试通过；BOOT-01/CORE-01/CORE-03/ART-01 仅进入 in_progress。该阶段未含真实 Worker；后续进展见下方，三个 M0 Gate 保持 pending。

A4 阶段复审：[A4 审核 F01–F03 修正及回归](validation/review-a4-2026-09-23.md)。关闭/替换等待、跨盘词法检查和单账户配置约束已补齐；该次复审不含真实 Worker、Windows 文件行为或多账户隔离。

B-IPC 阶段：[审核修正与回归](validation/review-b-ipc-2026-09-23.md) · [原阶段进程证据](validation/b-ipc-2026-09-23.md) · [进程契约](ssot/b-worker-contract.md)。限定 B-IPC 已通过，该阶段的下一步为 C；后续 C 实施见下方。

C 阶段：[最小桌面验证](validation/c-desktop-2026-09-23.md) · [桌面/展示契约](ssot/c-desktop-contract.md) · [发行和命令摘要](validation/c-desktop-inputs.json)。Electron/React 已连既有产品和 Worker 链路，支持明确合成的审批/取消/恢复与真实 Markdown。后续 C 修正与 D1 进展见下方，三个 M0 Gate 仍 pending。

C 修正：[C01/C02 审核复核](validation/review-c-2026-09-24.md) · [输入摘要](validation/review-c-inputs.json)。异常关闭失败与跨任务未确认命令身份已补齐，实际 Electron 和前序回归通过；其后按用户授权快进合入 develop（`6bde632`）。

D1 阶段：[Mac 退出验证](validation/d-exit-2026-09-24.md) · [平台契约](ssot/d-platform-contract.md) · [输入摘要](validation/d-exit-inputs.json)。正常退出结算和失败后的窗口内恢复已限定通过；当时的下一增量为 D2 Shell/PTY 产品接入，后续集成见下方。Windows 尚未实测，D 整体与三个 M0 Gate 未完成。


最新 D2-S：[非交互 Shell 产品链路](validation/d2-shell-2026-09-28.md) · [执行/恢复边界](ssot/d-platform-contract.md)。D1 已合入 develop，限定 Shell 增量独立待审；下一步只推进 D2-T，交互终端与 Windows 不由此宣称完成。

D2-S 最新修正：[S01 输出/收据契约复审](validation/review-d2s-2026-09-28.md) · [输入摘要](validation/review-d2s-inputs.json)。原提交反例和修正代码实测分开记录，下一开发项保持 D2-T。

## M1 路线采纳（2026-09-28）

D2-S/S01 已集成 develop（`22cf288`）。此前 D2-T 为下一项的阶段表述保留为历史；当前唯一开发项已调整为 M1 无工具会话，详情见 [NEXT_STEPS](planning/NEXT_STEPS.md) 与 [术语](ssot/glossary.md)。用户将稍后配置服务与预算，当前未授权真实模型调用。

## M1-A 离线完成（2026-09-28）

[报告](validation/m1-2026-09-28.md) · [配置入口](MODEL_CONFIGURATION.md) · [接入契约](ssot/m1-model-contract.md)。现有链路已支持真实 Pi 无工具 prompt、原生上下文、有界流、取消/恢复和配置；所有 Provider 响应仍是明确合成输入，真实模型调用 0。M0-UI/M0-SDK 按原条件逐项核对为 passed，M0-Pi blocked，不由测试数量自动晋级。MODEL-01 限定 done，唯一待推进为 M1-B 用户配置与授权后的真实服务验收，M2/PTY 不启动。

## M1 OpenAI 与持久凭据（2026-09-29）

[增量证据](validation/m1-openai-2026-09-29.md)：真实 Pi 原生 Responses/Chat Completions 已通过合成响应接缝，应用专用 auth.json 在启动/重连时读取。没有真实服务/账户调用，唯一下一项仍为 M1-B 获授权验收；MODEL-01 只追加限定证据，其余 Gate 状态不变。

## Pi 0.87.1 与 M1 首次真实调用（2026-09-29）

[最新报告](validation/pi-0871-m1-live-2026-09-29.md)：升级精确发行包、两轮初始化和29种回归命令通过。真实 gpt-6-luna 首条成功；重开继续触及30秒期限，清理后failed，未自动重发，活跃取消未执行。MODEL-02 进入 in_progress；唯一当前项是统一计划后的 M1-B 收尾，未完成完整M1或M0-Pi、未进入M2。前面的等待授权/零真实调用表述仅为历史阶段。

## develop 复审与 M1-B 续验（2026-09-29）

[最新修订证据](validation/review-develop-m1-2026-09-29.md)：R01/R02/R03与现状文档已修正；原授权保留且累计4/4，真实原会话恢复与活跃取消通过。MODEL-02 限定 done；此前“恢复/取消待验收”为历史阶段。该次交付止于M1，当前推进顺序见 NEXT_STEPS。M0-Pi仍blocked。

长流语义补充：[单个LLM请求的空闲与总期限修正](validation/m1-stream-timeout-2026-09-29.md)，12条针对性回归通过，新增真实调用0。历史5分钟值曾同时约束总期限；新模板独立配置两者，旧授权不自动修改。


## M1 收口与30分钟决策确认（2026-09-29）

[逐项核对](validation/m1-closeout-2026-09-29.md) 统一已实现的预算修订、原会话续验、HTTP时间边界及安全展示证据；采用清单补齐 agent-session、native-history、pi-settings、product-coordination、desktop-ui 的相关引用。用户已确认单个LLM总上限30分钟、独立空闲上限5分钟，旧配置和4/4消费不变。接下来按 [唯一计划](planning/NEXT_STEPS.md) 推进M2离线增量；本次未新增真实调用，不晋级M0-Pi。

M1已集成develop，M2功能分支基于最新 `148022b05250cfda824725778e9a056d00cd6830`。[M2离线报告](validation/m2-file-agent-2026-09-29.md) 记录多请求预算、逐操作授权/结果、真实进程恢复和桌面展示；实际SDK/文件/SQLite/进程，模型均为SYNTHETIC。MODEL-03推进in_progress，A05真实工具验收仍缺证据；唯一当前项是M2-C验收计划与新授权准备。原4/4授权耗尽，本轮真实调用0；M0-Pi仍blocked。前文各“当前/下一步”仅保留当时阶段范围。

M2 最新复审：[修正与实机证据](validation/review-m2-2026-09-29.md) · [M2-C 待批准方案](planning/M2_C_ACCEPTANCE_PLAN.md)。

## 主功能与前端（2026-09-29）

[主功能优先及前端优化分期](planning/AGENT_MVP_UI_PLAN.md) · [真实截图审查、布局修正与Mac回归](validation/ui-layout-2026-09-29.md)。下一主功能是模型自主Bash，不是PTY或更多验收设施；前期落地UI布局，本轮动态Bash与工作目录入口已接入，见 [Agent Shell契约](ssot/agent-shell-contract.md)。历史阶段的“唯一下一项”不覆盖当前NEXT_STEPS顶部。


2026-09-30更新：[Agent Shell实施与回归](validation/agent-shell-2026-09-30.md)。MODEL-04限定实现继续in_progress，M0-Pi仍blocked；实际下一步以NEXT_STEPS顶部为准。

2026-09-30授权更新：用户取消LLM累计/单Run请求次数上限；历史4次与费用预留保留，费用/数据/工具权限未扩大。[配置与修订](MODEL_CONFIGURATION.md#不限制请求次数)。旧4/4不再是次数阻塞依据；没有新增真实模型证据。

## 限定真实项目任务（2026-09-30）

[被测代码、首次拒绝和四场景证据](validation/agent-task-live-2026-09-30.md)：gpt-6-luna真实read/write/Bash任务、拒绝、活跃Shell取消与原Session恢复通过，新增10请求、旧账本/身份保留。MODEL-03/04限定done，M0-Pi按既定条件passed；CLI真实产品链路与历史Electron UI证据分列。前面的待授权/blocked是历史，唯一当前事项以NEXT_STEPS顶部的交付复审与develop集成准备为准。

最新集成：[2026-09-30 develop集成检查](validation/develop-integration-2026-09-30.md)。M2/Agent Shell已进入develop；下一步以 [NEXT_STEPS](planning/NEXT_STEPS.md) 顶部UI-P2为准。

UI-P2前端分页组合：[接入证据与范围](validation/ui-p2-pages-2026-09-30.md)。正式历史/工具/成果分页、独立审批/停止、错误与重连已限定Mac验证；尚未集成develop，唯一当前事项见NEXT_STEPS顶部。
当前UI-P2后端接口见 [运行边界与分页契约](ssot/backend-history-contract.md)、[前端交接](planning/BACKEND_HISTORY_HANDOFF.md) 和 [本轮脱敏报告](validation/backend-history-2026-09-30.md)。

最新双线集成：[develop@169df60收口与真实使用测试范围](validation/ui-p2-merged-2026-09-30.md)。前端分页和后端边界已在同一版本；总UI等待失败单列，不能把其他回归通过当作全部UI验收。

同一169df60已在用户指定前端工作树补跑完整UI并通过；集成树两次超时仍保留，未定位工作树/运行环境差异。实际分列证据见上述集成报告。

2026-09-30最新修正：[F01定向刷新与F02复用依据](validation/ui-targeted-refresh-2026-09-30.md)。新回复不再重读全部已加载历史，批次失败/切换/重连仍保留一致性；实际Mac离线回归、历史未定位UI超时与未覆盖项分列。分支待复审集成，唯一当前顺序以NEXT_STEPS顶部为准，未新增真实模型调用。

2026-09-30 Q1：[工具查询迁移、发行与离线证据](validation/ui-query-tools-2026-09-30.md)。F01已集成develop@4644902；Q1代码5b10b19在功能分支，工具数据由Query 5.104.0拥有，重连保留浏览位置。历史/成果待Q2，真实模型调用0，不晋级完整任务/Gate。

[Q1集成后真实桌面检查](validation/q1-desktop-live-2026-10-01.md)：区分模型访问失败、旧成果浏览与正常重开，不将失败请求计为工具验收。

2026-10-03权限模式：[契约](ssot/permission-modes-contract.md) · [限定验证](validation/permission-modes-2026-10-03.md)。输入区可选择人工或工作目录内自动审批，设置与每次任务的有效模式持久保存；完全访问尚未提供。

2026-10-03：[可拖动三栏与窄窗详情](validation/pane-layout-2026-10-03.md)，固定社区分隔条适配、左右收起/键盘调宽和布局偏好；审批行内收口尚未实施。

2026-10-03后续：[会话内审批与权限说明](validation/inline-approval-2026-10-03.md)，Operation身份绑定、历史失败兜底、右栏成果专用和定位/阅读修正；未扩大执行权限。
