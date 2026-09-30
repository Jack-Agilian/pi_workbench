# 当前实施 SSOT

更新：2026-09-30。范围：Pi 桌面工作台的复用策略、模块责任、接入边界和下一步交付。

**决策：复用优先，Pi SDK 是默认实现；薄适配只承接产品差异，不重写上游已有能力。** 用户已明确要求尽量不重复造轮子。本目录是这一要求的实施基线，不代表实现、兼容测试或团队验收已经完成。

## 阅读顺序与权威边界

1. [复用优先架构](reuse-first.md)：决定什么依赖上游、什么只包一层、什么确需自研；含替代旧方案的 ADR。模块级参考文件/API、替换范围和保留边界见[指定参考实现](reference-implementations.md)。
2. [模块接入契约](integration-contracts.md)：决定接口边界、权限、状态所有权和故障语义。
3. [上游证据](upstream-evidence.md)：固定源码提交、公开导出与核验限制；不把 main 上的源码当作已发布 API。
4. [机器可读复用清单](reuse-map.json)：逐项记录复用方式、上游符号/入口、产品增量和验收门槛。
5. [实施顺序](../planning/NEXT_STEPS.md) 与 [工作项](../planning/backlog.json)：唯一的当前工作顺序和验收细目；尚未创建远端 Issues。

`docs/startup/` 继续保留原始 0.1 快照、原始接口和历史报告，不改摘要。**涉及复用策略、工具接入、技能解析、模型配置、任务队列、传输选型、模块拆分和交付先后的冲突，以本目录为准。**未被本目录覆盖的产品范围、UI 体验及安全要求继续参考原快照。已落地代码和测试是实现事实；与规格冲突时报告偏差，不静默反向改写规格。

原始 `contracts/app-protocol.ts` 与 SQL 只是参考，不能整份复制作为首版必做项。B 已新增有限的产品 DTO/命令校验与模块级持久核心，范围见 [最小契约](b-minimal-contract.md)；[B-IPC](b-worker-contract.md) 已补有限、可校验的进程协议和宿主监督。A0/A1 引入的 Pi 精确依赖继续沿用，C 另以 [最小桌面契约](c-desktop-contract.md) 引入精确 Electron/React 与有来源的社区键盘保护片段。严格声明检查经 [ADR-A0 类型补丁](adr-a0-pi-types.md) 通过，原始发行缺陷及采用边界见 [A0/A1 缺口](../validation/a0-a1-gaps.md)。

维护规则见 [状态、证据与验收](maintenance.md)；本次处理清单见 [R01–R08 修订](review-fixes.md)。该修订只核验维护脚本和接缝契约；后续实际接入证据分别登记如下。

## 本次明确减少的自研

不另写 Agent Loop、Session JSONL/分支/压缩、Provider/OAuth、SKILL.md 解析器、包来源解析器、基础 read/edit/write/bash 工具，也不把终端渲染或 Git diff 算法重新实现一遍。产品仍拥有授权、操作审计、跨任务调度、成果索引和桌面体验。

## 验证

```bash
python scripts/check-ssot.py
python scripts/check-docs.py --structural-only
python scripts/test-tools.py
```

完整原始设计示例检查仍可用 `python scripts/check-docs.py --typecheck`，其通过不能代替真实 Pi 与 macOS/Windows 测试。检查结果生成到 `.artifacts/`，不覆盖快照里的旧报告。

以下 A0–A4/B 小节保留各阶段交付范围；当前工作顺序以 [NEXT_STEPS 顶部](../planning/NEXT_STEPS.md) 为准。最新复审修正在末节单列。

## A0/A1 实际进度

[当前被测提交与脱敏报告](../validation/a0-a1-closeout-2026-09-22.md) · [本轮发行包完整性](../validation/a0-a1-closeout-release.json) · [公开入口缺口](../validation/a0-a1-gaps.md)。Pi 0.87.0 / Node 24.21.0 的零模型 Session 探针、严格应用类型检查和重复初始化通过。采用固定声明补丁及精确 MCP 类型 peer，官方原始声明缺陷仍在；历史 failed 证据保留。BOOT-03 与 CORE-02 均 in_progress，M0 三个 Gate pending。

## A2 实际进度

[被测提交与工具报告](../validation/a2-2026-09-22.md) · [输入摘要](../validation/a2-inputs.json) · [辅助 I/O 与平台边界](../validation/a2-boundaries.md)。19 项工具接缝与 4 项真实 macOS Bash 测试通过，A1 回归仍通过；没有新增依赖或改动 Pi 运行时代码。read/edit/write/bash 仅采用公开工厂与 Operations。CORE-04、SEC-02 及三项相关能力进入 in_progress；不把探针称为完整权限/平台系统。三个 M0 Gate 仍 pending，本轮未进入 A3/A4。

## A3 实际进度

[被测提交与资源/包报告](../validation/a3-2026-09-22.md) · [输入摘要](../validation/a3-inputs.json) · [缺口与边界](../validation/a3-boundaries.md)。9 项资源、8 项实际 npm/Git 探针及干净副本两轮回归通过。复用 Pi 解析/安装/Session 刷新，只新增批准快照和准入检查；默认加载器缺包隐式安装等行为已复现，运行时不采用该路径。skills/package-manager 与 SKL-01/PKG-01 进入 in_progress；resources/BOOT-03 追加限定证据，三个 M0 Gate 保持 pending。本轮停止于 A3，未进入 A4。

## A4 实际进度

[被测提交与凭据/模型报告](../validation/a4-2026-09-22.md) · [输入摘要](../validation/a4-inputs.json) · [公开错误与生命周期边界](../validation/a4-boundaries.md)。16 项合成认证接缝通过，复用 Pi 的 store 锁、登录/刷新、目录与 Session 选型，只新增状态/结果白名单投影和隔离测试。SEC-03 进入 in_progress，models-auth/pi-settings 追加限定证据；系统凭据存储、真实 OAuth、产品 Renderer/IPC/日志仍未完成，三个 M0 Gate 仍 pending。本轮停止于 A4，下一轮才进入 B。

## B 最小产品核心实际进度

[被测提交与报告](../validation/b-2026-09-22.md) · [最小契约](b-minimal-contract.md) · [输入摘要](../validation/b-inputs.json) · [权限/恢复边界](../validation/b-boundaries.md)。17 项真实 SQLite/合成宿主测试与 5 项 Pi 接入测试通过，复用原生 Session/Runtime/write，只新增产品协调、持久事件和真实 Markdown 成果索引。product-coordination/artifact 与 BOOT-01/CORE-01/CORE-03/ART-01 进入 in_progress，新增证据只支持模块级范围。该阶段未包含真实 Worker/IPC；后续 B-IPC 进展见下方，三个 M0 Gate 仍未完成。

## 最新复审修正（2026-09-23）

[A4 审核复核](../validation/review-a4-2026-09-23.md)：F01 关闭/替换竞态、F02 跨盘范围已修正，F03 固定 M0 同 provider 单账户约束。Session 15 项、资源 12 项、认证 18 项及 B/前序回归通过；CORE-02/SKL-01/SEC-03 保持 in_progress，三个 M0 Gate pending。该次复审没有包含 B-IPC；唯一当前开发项以 NEXT_STEPS 顶部为准。

## B-IPC：2026-09-23

[真实进程验证](../validation/b-ipc-2026-09-23.md) · [进程/审批/恢复契约](b-worker-contract.md) · [被测输入与命令](../validation/b-ipc-inputs.json)。30 项混合检查、四场景驱动及原回归通过；Pi 仍拥有 Session、工具实现与原生历史，App Server 仍唯一写产品库。实际 Worker OS 文件限制、App Server SIGKILL 后固定后代清理和结果丢失只核验不重写均已测试。限定 B-IPC 完成；相关能力保持 in_progress，三个 M0 Gate pending，唯一下一步为 C 最小桌面界面及安全展示投影。

## B-IPC 审核修正（2026-09-23）

[复核与修正证据](../validation/review-b-ipc-2026-09-23.md) 保留原 0e9a01a 的四项缺陷及实际被测修正 SHA。冷启动先失效旧授权再检查清理证明，已登记成果恢复与当前可用性分开，IPC v2 严格枚举及原生路径持久确认已回归；Worker 48、Core 20、SDK 5 及 A1–A4 通过。前节 30 项属于历史范围；相关能力保持 in_progress，三个 M0 Gate pending，唯一当前项仍为 C。

## C 最小桌面：2026-09-23

[实际代码 SHA 与验证](../validation/c-desktop-2026-09-23.md) · [桌面/展示边界](c-desktop-contract.md) · [发行与命令摘要](../validation/c-desktop-inputs.json)。真实 Electron 连接独立 Node 宿主和 Pi Worker，四个无模型场景、12 项桌面检查及前序回归通过。正文投影与工具/成果视图只用产品 DTO；原生 Session 仍归 Pi。BOOT-02/BOOT-04/UI-01/UI-02/SEC-01 开始限定实施，三个 M0 Gate 保持 pending。前面“下一步 C”为历史记录；唯一当前顺序以 NEXT_STEPS 顶部的 D 待启动为准。

## C 审核修正：2026-09-24

[复核与修正证据](../validation/review-c-2026-09-24.md) 保留基线 `6410741` 的两项反例，修正异常宿主关闭结果和按命令意图保留重试身份。14 项桌面检查、实际 Electron 四场景及新增确认丢失/关闭失败用例与前序回归通过。旧 12 项不覆盖这两个缺口；相关任务保持 in_progress，三个 M0 Gate pending。没有新增依赖、合并 develop 或启动 D。

## D1 Mac 退出闭环：2026-09-24

C 及修正随后已按用户授权集成 develop（`6bde632`），D 分支从该基线创建。[D 契约](d-platform-contract.md) · [实际代码/退出证据](../validation/d-exit-2026-09-24.md) · [命令摘要](../validation/d-exit-inputs.json)。12 个真实 Electron 退出场景、15 项桌面检查和原回归通过；复用产品取消/对账及 guardian，缺证据仍 unknown/blocked，并保留原窗口的显式恢复路径。D1 完成有限范围，D 整体仍进行中；下一增量是 D2 Shell/PTY 产品接入，Windows 环境尚未确认，三个 M0 Gate pending。

## D1 审核复核：2026-09-28

[复审证据](../validation/review-d1-2026-09-28.md) 核验审核包摘要/源文件并在 `4b56f89` 重跑局部检查、桌面与真实退出矩阵，未发现新增合并阻断项。仅更正 AGENTS 现状描述、登记复审与 D2 前置边界；运行代码和依赖未改变，未合并 develop、未启动 D2。上一轮完整 A/B/C 回归不能冒充本次重跑，三个 M0 Gate 保持 pending。


## D2-S 非交互 Bash：2026-09-28

D1 及复审已按授权集成 develop（`3d307e9`）。[D2-S 报告](../validation/d2-shell-2026-09-28.md) · [契约与复用原因](d-platform-contract.md)：Pi Bash 通过公开 Operations 委托既有 guardian 的宿主批准执行，独立 Shell 组、审批、取消、收据及结果丢失恢复分别验证。SQL v5/IPC v4 只扩展必要产品投影/消息；没有新依赖或真实模型。D2-S 分支待审，下一开发项为 D2-T 单用户终端；Windows/完整 D 和 M0 Gate 未完成。

## D2-S 审核修正：2026-09-28

[S01 复审与证据](../validation/review-d2s-2026-09-28.md) 在原提交实际 Mac 后端复现非法 UTF-8 导致有效命令收据被拒绝；修正解码后字节预算，原收据校验和权限不放宽。修正 SHA 上 Shell 28、Worker 50、Electron Shell 三场景/退出 18 及前序回归通过。未合并分支，唯一下一开发项仍 D2-T，M0 Gate 保持 pending。

## M1 路线采纳（2026-09-28）

D2-S/S01 已集成 develop（`22cf288`）。此前 D2-T 为下一项的阶段表述保留为历史；当前唯一开发项已调整为 M1 无工具会话，详情见 [NEXT_STEPS](../planning/NEXT_STEPS.md) 与 [术语](glossary.md)。用户将稍后配置服务与预算，当前未授权真实模型调用。

## M1-A 离线完成（2026-09-28）

[报告](../validation/m1-2026-09-28.md) · [配置入口](../MODEL_CONFIGURATION.md) · [接入契约](m1-model-contract.md)。现有链路已支持真实 Pi 无工具 prompt、原生上下文、有界流、取消/恢复和配置；所有 Provider 响应仍是明确合成输入，真实模型调用 0。M0-UI/M0-SDK 按原条件逐项核对为 passed，M0-Pi blocked，不由测试数量自动晋级。MODEL-01 限定 done，唯一待推进为 M1-B 用户配置与授权后的真实服务验收，M2/PTY 不启动。

## M1 OpenAI 与持久凭据（2026-09-29）

[增量证据](../validation/m1-openai-2026-09-29.md)：真实 Pi 原生 Responses/Chat Completions 已通过合成响应接缝，应用专用 auth.json 在启动/重连时读取。没有真实服务/账户调用，唯一下一项仍为 M1-B 获授权验收；MODEL-01 只追加限定证据，其余 Gate 状态不变。

## Pi 0.87.1 与 M1 首次真实调用（2026-09-29）

[最新报告](../validation/pi-0871-m1-live-2026-09-29.md)：升级精确发行包、两轮初始化和29种回归命令通过。真实 gpt-6-luna 首条成功；重开继续触及30秒期限，清理后failed，未自动重发，活跃取消未执行。MODEL-02 进入 in_progress；唯一当前项是统一计划后的 M1-B 收尾，未完成完整M1或M0-Pi、未进入M2。前面的等待授权/零真实调用表述仅为历史阶段。

## develop 复审与 M1-B 续验（2026-09-29）

[最新修订证据](../validation/review-develop-m1-2026-09-29.md)：R01/R02/R03与现状文档已修正；原授权保留且累计4/4，真实原会话恢复与活跃取消通过。MODEL-02 限定 done；此前“恢复/取消待验收”为历史阶段。该次交付止于M1，当前推进顺序见 NEXT_STEPS。M0-Pi仍blocked。

长流语义补充：[单个LLM请求的空闲与总期限修正](../validation/m1-stream-timeout-2026-09-29.md)，12条针对性回归通过，新增真实调用0。历史5分钟值曾同时约束总期限；新模板独立配置两者，旧授权不自动修改。


## M1 收口与30分钟决策确认（2026-09-29）

[逐项核对](../validation/m1-closeout-2026-09-29.md) 统一已实现的预算修订、原会话续验、HTTP时间边界及安全展示证据；采用清单补齐 agent-session、native-history、pi-settings、product-coordination、desktop-ui 的相关引用。用户已确认单个LLM总上限30分钟、独立空闲上限5分钟，旧配置和4/4消费不变。接下来按 [唯一计划](../planning/NEXT_STEPS.md) 推进M2离线增量；本次未新增真实调用，不晋级M0-Pi。

M1已集成develop，M2功能分支基于最新 `148022b05250cfda824725778e9a056d00cd6830`。[M2离线报告](../validation/m2-file-agent-2026-09-29.md) 记录多请求预算、逐操作授权/结果、真实进程恢复和桌面展示；实际SDK/文件/SQLite/进程，模型均为SYNTHETIC。MODEL-03推进in_progress，A05真实工具验收仍缺证据；唯一当前项是M2-C验收计划与新授权准备。原4/4授权耗尽，本轮真实调用0；M0-Pi仍blocked。前文各“当前/下一步”仅保留当时阶段范围。

M2 实机复审：[两处正确性修正与 Mac 回归](../validation/review-m2-2026-09-29.md)；[M2-C 新授权方案](../planning/M2_C_ACCEPTANCE_PLAN.md)。修订分支尚未集成，真实调用未开始。

## 主功能优先与前端布局（2026-09-29）

用户要求将下一主线明确为模型驱动的沙箱Bash任务闭环，前端改进配套推进，见 [主功能/UI计划](../planning/AGENT_MVP_UI_PLAN.md)。[本轮布局实拍](../validation/ui-layout-2026-09-29.md) 已修复小窗口审批首屏不可见并完成限定Mac回归。后续动态Bash和目录入口已接入，见 [Agent Shell契约](agent-shell-contract.md)；不以离线/UI结果替代真实模型验收。原授权和所有Gate状态不变；现有验收驱动只作为工具，不继续扩大为主线。


2026-09-30更新：[Agent Shell限定离线证据](../validation/agent-shell-2026-09-30.md)。MODEL-04限定实现继续in_progress，M0-Pi仍blocked；实际下一步以NEXT_STEPS顶部为准。

2026-09-30授权更新：用户取消LLM累计/单Run请求次数上限；历史4次与费用预留保留，费用/数据/工具权限未扩大。[配置与修订](../MODEL_CONFIGURATION.md#不限制请求次数)。旧4/4不再是次数阻塞依据；没有新增真实模型证据。

[次数缺省、本机期限修订与限定离线回归证据](../validation/request-defaults-2026-09-30.md)。

## 限定真实项目任务（2026-09-30）

[被测代码、首次拒绝和四场景证据](../validation/agent-task-live-2026-09-30.md)：gpt-6-luna真实read/write/Bash任务、拒绝、活跃Shell取消与原Session恢复通过，新增10请求、旧账本/身份保留。MODEL-03/04限定done，M0-Pi按既定条件passed；CLI真实产品链路与历史Electron UI证据分列。前面的待授权/blocked是历史，唯一当前事项以NEXT_STEPS顶部为准。

## develop 集成（2026-09-30）

用户授权后已快进集成M2与Agent Shell全部20个提交，基线 `34ed62e3fc875c56059eb19c1f02781d72c78bfc`；[集成检查与范围](../validation/develop-integration-2026-09-30.md)。既有证据保留原被测SHA，Gate状态不因合并扩大；唯一下一步为UI-P2长历史与成果浏览体验，本次没有开始实现或新增模型调用。

## UI-P2 前端集成（2026-09-30）

前端三个提交已按授权进入develop，基线 `6884e278bb2d9057a78fa5b74b513a1d0798320e`；[本次集成检查](../validation/ui-p2-integration-2026-09-30.md)。右栏可收起/调宽，审批与停止常驻，按会话保留草稿/浏览位置，成果显示来源/版本及宿主核验状态。下一步为后端修正/分页契约接入与组合验收；R03全量历史超限未解决，任务与Gate不因合并自动晋级。

## UI-P2 分页组合（2026-09-30，尚未集成develop）

前端分支已采用后端45e45a5/8e1b598共享契约，新增历史/工具/成果分页和独立活动显示；[实际SHA、失败与限定证据](../validation/ui-p2-pages-2026-09-30.md)。超过旧传输上限的60条持久合成Run可由Electron逐页读取，并通过真实Worker新任务取消和重连核对；零真实模型。上一节“R03未解决”描述旧集成基线，当前分支已限定解决Renderer传输路径，未完成虚拟列表、home目录分页或原生全部正文。唯一当前事项为NEXT_STEPS顶部的复审与集成收口。
## UI-P2 后端前置（2026-09-30）

[运行边界/分页契约](backend-history-contract.md) · [前端交接](../planning/BACKEND_HISTORY_HANDOFF.md) · [代码与验证范围](../validation/backend-history-2026-09-30.md)。基于develop@58d3130，只增加宿主工作区重新准入、展示消息水位、已有SQLite上的有界分页和工作树离线profile。复用Pi原生Session/工具、SQLite查询模式、Electron用户数据目录，不新建Harness或引入分页框架。Renderer尚未接入，旧全量读取上限仍存在；当前唯一事项继续UI-P2，CORE-03/SEC-02/UI-01/ART-01保持in_progress，既有Gate不扩大。

## 双线合并收口（2026-09-30）

用户授权后，前端c0e99c2和后端feaa3f4已合入develop@169df60；[组合检查、UI等待失败与真实使用范围](../validation/ui-p2-merged-2026-09-30.md)。前面的“尚未集成”描述各自交付当时状态；当前以NEXT_STEPS和此集成记录为准。类型/后端/桌面及三套模型模式离线Electron通过，总UI在集成树两次超时不记通过。任务/Gate不扩大，下一步是限定真实桌面人工使用测试。

同一169df60已在用户指定前端工作树补跑完整UI并通过；集成树两次超时仍保留，未定位工作树/运行环境差异。实际分列证据见上述集成报告。

2026-09-30最新修正：[F01定向刷新与F02复用依据](../validation/ui-targeted-refresh-2026-09-30.md)。新回复不再重读全部已加载历史，批次失败/切换/重连仍保留一致性；实际Mac离线回归、历史未定位UI超时与未覆盖项分列。分支待复审集成，唯一当前顺序以NEXT_STEPS顶部为准，未新增真实模型调用。
