# 从文档到可运行产品：复用优先

当前依据：[SSOT](../ssot/README.md)、[任务账本](backlog.json)。以下当前事项优先于后文历史阶段的“下一步”。

## 唯一当前事项：权限模式接入设计

2026-10-03按用户要求从零散修订改为完整 UI 重构。代码 `f2787e0cf61acf484786400d9e31090cb3e9cbc9` 修正正文/操作分区与刷新语义；`5468a3df96f1c6ae343b77e69c219630ba6320b2` 整体重排导航、会话、输入、审批/成果页和样式。结果与失败边界见[本轮报告](../validation/ui-refactor-2026-10-03.md)，界面与参考映射见[UI契约](../ssot/ui-experience-contract.md)。这些提交在功能分支，尚未合入develop。

整体方向不变：Pi 原生能力和宿主权威继续复用，界面以会话阅读/执行为中心。整套改版已在功能分支完成限定验证；用户新提出的人工审批／自动审批／完全访问三档纳入下一接入设计，不能继续把逐项审批当作唯一永久产品形态，也不能做只有前端开关的假权限模式。

后续单线顺序：

1. 权限模式：明确三档的审批规则与实际访问范围，宿主持久策略和Run绑定、界面紧凑入口一起实现；当前只提供真实已实现的人工审批。自动规则、完全访问与模型代审分别定义，不能混称。
2. 会话识别补齐持久命名/重命名；当前目录+短身份只是同名区分。随后完成安全阅读：Markdown 与按需原生全文投影，仍不透传整个 SDK 对象。
3. 集中进行同一流程的前后端回归及人工体验复审，记录实际被测 SHA。Q2/Virtual/durable仍按既定采用条件，不成为布局或权限入口的前置。

UI-01/02、ART-01保持in_progress，M0 Gate不扩大；不自动启动市场、并发、PTY、其他平台或生产发行。真实模型已有历史证据，本轮界面验证使用合成Provider，零真实调用。以下为历史阶段记录，原“下一步”不覆盖本节。

### 既有集成与历史阶段记录

2026-09-30按用户授权，将前端 `codex/ui-history-artifacts@c0e99c2` 和后端 `codex/backend-history-safety@feaa3f4` 合入develop，组合代码提交 `169df60a51fc1d394d6cc45c335e54eddbc9cef7`。双方证据ID保留，分页与后端边界现在位于同一分支；集成检查与当前可测范围见 [收口报告](../validation/ui-p2-merged-2026-09-30.md)。

F01/F02及规划已快进合入develop `46449024d31b0ce4601c971b90b8c036f88a27a7`，推送后独立读回同SHA。Q1在`codex/ui-query-tools`完成限定实现，代码`5b10b19fb608159a37459592b265c6392d0d5331`，见[发行与离线验证报告](../validation/ui-query-tools-2026-09-30.md)。Q1计划审核已对照实现完成[复核](../validation/q1-plan-rereview-2026-09-30.md)，已快进集成并推送develop `ee409b1606c794fb853290e7e238bc30eebe638d`，独立读回一致；不并行启动Q2、Virtual或durable。

2026-10-01真实Electron检查：代理发送2次、用户手动2次请求，均失败（403/401），无工具执行；原会话/成果核验预览、正常关闭重开、原账本保留与进程清理通过限定检查，见[实际报告](../validation/q1-desktop-live-2026-10-01.md)。实际请求记录保留于历史报告；旧金额/次数快照不再用于准入。当前配置及原生记录均确认Responses，不是messages接口；先恢复当前端点的访问，再续验下述工具闭环。

2026-10-03按用户授权复验1次：真实Responses文本回复`CONNECTIVITY_OK`，0工具、原21条账本未改，累计22次；见[复验报告](../validation/q1-desktop-retry-2026-10-03.md)。当前已解除文本访问阻塞，但不据此宣布工具闭环或历史401/403根因解决。安全错误诊断已按[Pi参考契约](../ssot/model-error-contract.md)完成限定离线增量，见[代码SHA与验证](../validation/model-errors-2026-10-03.md)：显示真实HTTP状态、已识别代码及安全说明，未知正文不保存，旧历史不补推原因。本轮新增真实调用0；唯一下一步仍是集中续验真实桌面工具/审批/取消，不为小修改连续付费调用。

2026-10-03用户进一步取消费用预算门槛：不再推算剩余额度或可支付次数，先完成真实桌面功能闭环；用量历史保留。当前策略及与测试限制的区分见[限制契约](../ssot/model-limits-contract.md)。这一决定覆盖下方早期费用余额快照的准入用途，不改写历史。

2026-10-03额度清理和实际桌面尝试：[被测代码与结果](../validation/product-defaults-desktop-2026-10-03.md)。产品模板与本机配置均已移除旧次数/费用/输出/工具额度；真实桌面本次5次HTTP仅Bash成功，文件工具被旧路径适配拒绝，不能计为工具闭环通过。目录内绝对路径规范化与工具失败提示已修正并完成离线回归；随后桌面操作工具窗口识别异常，真实修正后续验尚未执行。唯一当前事项仍为上述集中桌面功能验证。

### 当前实施范围：前后端共同推进

当前工作树不再仅限前端线路。围绕同一产品流程集中开发：前端负责对话/工具结果/成果展示及审批与停止；App Server负责请求准入、审批、结算、持久状态和恢复；Pi Adapter/Worker负责复用公开SDK并处理接入差异。实际验证暴露哪一层问题，就在对应层修复并批量回归，不另开孤立探针，不为了界面绕过宿主权威。

本轮执行顺序已完成：默认配置与路径/错误修正、真实工具与允许/拒绝/取消/恢复/成果集中验证、反馈修复及离线回归。交付复审以最新报告为准。请求次数和费用不作为验收额度，历史用量仍记录。

### Q1已交付范围

现有operationPage工具范围由精确TanStack Query 5.104.0接管缓存、加载/错误及重复读取；删除该范围旧LoadedRange缓存。宿主生成连接身份、旧请求隔离、手动重试、断网本地读取、整批水位/发布及IPC背压已接入；保留F01的64/256历史正文2次方法查询断言。重连仅携带浏览位置，新缓存重新读取。具体接缝和默认值见[SSOT迁移契约](../ssot/reference-implementations.md)。

接下来做以下真实桌面使用检查，真实模型/工具与操作者身份分别记录，不把代理程序化操作称为用户人工验收。Q2是候选后续增量，仅在Q1和使用反馈证明具体维护收益后选择范围，不以所有查询都换库为目标，也不阻塞真实使用。滚动按pi-gui校正，Virtual仍只在实测布局瓶颈后启动；durable不迁移。历史另一工作树UI超时仍未定位；本轮发现并修复的重连浏览深度回归与该历史问题分开记录。

### Q1离线验收后的真实人工检查

1. 在macOS arm64用 `npm run model:config -- check` 核对原配置，再运行 `npm run desktop:model`；保持单一真实profile、凭据与费用账本。配置不自动修改；本次实际失败请求单列在上方报告。
2. 只在现有授权的合成无敏感项目中检查真实对话/原会话继续、读取/写入/修改Markdown、逐项批准或拒绝受限Bash、活跃停止、重启恢复和成果预览。先验证完整工作流程，再集中修问题，不用付费请求逐行调试。
3. 按用户新指示删除512输出token、8个操作、6条Bash/每条30秒、4/8次及累计$1等验证额度，输出沿用Pi/模型默认；历史用量继续记录，不推算剩余额度。30分钟单LLM总超时/5分钟网络空闲是API检测，独立保留。逐操作审批及工作目录/凭据隔离不变。

[前端交接](UI_P2_FRONTEND_HANDOFF.md)、[后端契约](../ssot/backend-history-contract.md)保留范围。R03旧全量响应超限已由Renderer正式分页路径限定解决；home目录未分页、无虚拟列表、原生全部正文未补载。UI-01/02、ART-01继续in_progress，既有M0 Gate不因合并扩大；完整人工体验、Windows、PTY、市场与生产发行后置。

已有真实任务代码 `688150f070797405250bb16ad3dc837bb0ddc64d`；[真实结果与首次失败](../validation/agent-task-live-2026-09-30.md)、[脱敏输入](../validation/agent-task-live-inputs-2026-09-30.json)、[实际模型生成报告](../validation/agent-task-result-2026-09-30.md)。以下是原CLI任务的历史消费与验证范围；最新桌面失败请求见本文顶部。

限定MODEL-03/04逐项done；M0-Pi补齐真实模型任务及Mac审批/取消/恢复证据后passed。M0-UI/M0-SDK沿用原passed，均不等于完整产品/通用沙箱/生产发布。真实任务走CLI→同DesktopHost/Worker产品链路，后续桌面失败请求不构成Electron真实模型完整闭环通过。

本轮gpt-6-luna新增10次LLM请求（正常7、拒绝1、活跃Shell取消1、原Session恢复1）；累计14次。历史账本和授权身份保留，用量仅作历史记录，不再计算剩余额度。请求次数和累计费用缺省不限，单LLM总超时30分钟、网络空闲5分钟属于API检测；数据范围和逐工具批准仍生效。实际账单未核验。

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
