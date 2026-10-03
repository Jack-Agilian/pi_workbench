# 前后端指定参考实现与采用边界

2026-09-30采纳。本文是[复用优先架构](reuse-first.md)的模块级补充；当前实施顺序只由[NEXT_STEPS](../planning/NEXT_STEPS.md)决定。除下文Q1工具查询已限定采用Query 5.104.0外，其余参考方向不等于已安装、移植或完成任务；[Q1证据](../validation/ui-query-tools-2026-09-30.md)列出实际范围。

## 本项目模块与具体接缝

下表上游文件路径相对相应上游仓库；本项目路径相对本仓库。来源编号见[上游证据](upstream-evidence.md)。

| 本项目模块 | 参考文件／API | 借鉴或替换范围 | 保留边界与当前状态 |
|---|---|---|---|
| `apps/desktop/renderer.tsx`、`run-history.tsx` | pi-gui `apps/desktop/src/features/conversation/conversation-timeline.tsx` [C03] | 主要桌面应用参考：分离加载/错误展示与时间线，按工具身份保存展开状态；选择可独立适配的组件或行为 | 产品DTO、Run/Operation身份、审批/成果语义不随组件改变。尚未移植这份时间线；原Composer移植沿用C01历史来源 |
| `apps/desktop/thread-pages.ts`及Renderer查询状态 | `@tanstack/react-query` v5：`QueryClient`、`useQuery`、`useInfiniteQuery`；TanStack/query `examples/react/infinite-query-with-max-pages/src/pages/index.tsx` [L04] | 通用查询缓存、加载/错误状态和重复读取合并的指定替换方向；实际迁移删除原同等职责，不并存两套缓存 | 产品事件到查询键的映射、Thread/Run归属、事件水位、页游标和既有IPC保留。Q1工具范围已用Query 5.104.0，历史/成果待Q2；F01产品适配保留，不继续扩展成通用查询框架 |
| `apps/desktop/timeline-scroll.ts` | pi-gui `apps/desktop/src/features/conversation/hooks/use-timeline-viewport.ts`及`timeline-layout.ts` [C03] | 对照跟随/阅读/恢复意图、`ReadingAnchor`的rowId/offsetWithinRow、用户滚动与程序恢复区分、会话隔离及布局稳定标志 | 当前小型hook可保留，只有一个scrollTop写入者；不复制整套估高、布局和虚拟化算法；草稿与阅读位置是本地UI状态 |
| 长历史DOM/尺寸测量（尚未接入） | TanStack/virtual `examples/react/dynamic/src/main.tsx`；React `useVirtualizer`、`getScrollElement`、`measureElement`、`getVirtualItems` [L05] | 实测DOM或布局瓶颈出现后，使用库承接通用虚拟化和尺寸测量 | 不替代服务端分页或阅读意图；不因F01直接安装，不与另一滚动控制者竞争；发布版选项需重新核对 |
| `apps/agent-server/desktop-pages.ts`、Core的`historyEntry` | SQLite官方Scrolling Window Queries [L06]，已有SQLite读取事务 | 保留固定产品keyset查询；按ID定向读取复用已有安全投影，不增加ORM/分页服务 | 宿主独占数据库；Thread/Run归属、插入上界、响应字节限制属于产品适配，不返回任意SQL、路径或SDK对象 |
| `apps/agent-server/core.ts`、`worker-supervisor.ts`及Guardian | Pi `packages/durable/README.md`的Persist and Resume、Tools、Watching a Conversation；`src/storage/sqlite/node.ts`；`openNodeSqliteStorage`、`Harness.open/resume`、`submit(requestId)`、工具replay策略及观察背压 [P16] | 新增通用持久任务、调度或观察流前的指定架构对照，逐项记录功能重叠与差距 | 当前不替换ProductCore/Guardian。原生Session、审批一次领取、未知副作用不重发、进程清理、预算和迁移必须分别验证；不能同时维护两套权威历史 |
| `packages/pi-adapter/` | 已锁定Pi的Session/Runtime/ModelRuntime、基础工具工厂及Operations | 继续现有公开SDK主路径，不重写循环、Provider、Session或基础工具 | Pi类型留在adapter及测试；宿主批准的资源/凭据/工具范围、产品审计和进程监督继续保留 |

pi-gui是当前主要桌面应用参考；OpenPi只保留定制资源/权限边界的定向参考，不作为第二套React组件主线。`use-stick-to-bottom`不作为并行采用路线，也不能叠加接管已有滚动位置。

## 固定源码与尚未完成的准入

pi-gui参考提交为 `163054227d370a49d09099c61eb65798481294ac`，本次会话已读取三个固定文件：

- [conversation-timeline.tsx](https://github.com/minghinmatthewlam/pi-gui/blob/163054227d370a49d09099c61eb65798481294ac/apps/desktop/src/features/conversation/conversation-timeline.tsx)，审核包记录blob `1ff13aeedfecfaa056389bedd09a1d9c3e95b5fa`。
- [use-timeline-viewport.ts](https://github.com/minghinmatthewlam/pi-gui/blob/163054227d370a49d09099c61eb65798481294ac/apps/desktop/src/features/conversation/hooks/use-timeline-viewport.ts)，审核包记录blob `873cd92d091e3463772f36643cfa4e48e25233b2`。
- [timeline-layout.ts](https://github.com/minghinmatthewlam/pi-gui/blob/163054227d370a49d09099c61eb65798481294ac/apps/desktop/src/features/conversation/timeline-layout.ts)，审核包记录blob `1f82f89a8cbf1237f01c0e90cbbd5de975aa17f6`。

这些文件依赖自身DisplayTimelineItem/TranscriptMessage及布局模块，不能直接import其应用内部路径。审核包的README/MIT说明不替代实际移植时对对应文件、依赖许可证和归属的核验；旧Composer采用提交不自动更新为此提交。本文未独立重算上述blob身份。

TanStack Query示例的审核包blob为 `29fac3d44a2af68d06950a3b9bfbbf64d9383cbe`，Virtual示例为 `5e4b2b7e0cae6e47aa592770ba976f4879e23998`。包内没有给出两个示例所属完整提交，本文保留其资料身份，不将滚动main链接或blob当作已核验发行版本。Q1已另行核对Query 5.104.0精确发行、固定源码/许可证、registry字节和公开接缝，复用唯一npm锁，见Q1报告；没有把上述示例blob当作发行证明，Virtual仍未采用。

durable继续对照P16固定 `1b347794e2a630e4359f2584f4eea388145d0ddf`；源码0.99.1/Experimental与本项目已安装Pi0.87.1分开，不把类方法和源码实现冒充已安装包根导出。

## 迁移必须保留的回归

1. F01已在 `e7764e46df3cb8bc3fcdcddc992246ebccfde95c` 限定修正：[实际证据](../validation/ui-targeted-refresh-2026-09-30.md)。64/256条已读历史的一次纯正文更新均为events+historyEntry两次方法查询；这是合成端口计数，不是IPC延迟或模型调用。迁移库必须保留同一断言，不得每次事件失效整个无限页集合。
2. 新记录跨页补齐、旧尾游标、300事件分批消费、批次失败保留完整旧视图和水位、未知事件重同步、会话切换停止后续读取均保留。缓存不能以较新快照跳过未消费事件，不能自动重试启动/审批/取消命令。
3. 不照抄示例maxPages=3裁掉当前可见旧页；未具备双向恢复前保持现有浏览语义。只迁移通用职责，不要求先建立两套生产实现进行比较。
4. 滚动借鉴以旧页前插、流式增长不打断阅读、工具展开/栏宽改变、会话切换、草稿/焦点和审批/停止可达为验收；不把复杂自研滚动引擎作为默认下一步。
5. durable采用前逐项核对Session迁移、审批/幂等、未知工具结果、取消结算、宿主及后代清理、费用账本和观察背压。工具中断结果本身不能证明macOS后代已清理。

## 已有代码迁移：明确交付而非只约束新功能

2026-09-30复审采纳`EXISTING_CODE_MIGRATION.md`。已有投入不是继续维护通用机制的充分理由；按后续维护职责、适配与迁移风险决定替换。F01修复查询放大，查询库迁移减少通用机制维护，两项目标分别验收，不重做已正确的F01逻辑。

| 增量 | 具体交付与删除范围 | 验收与停止条件 |
|---|---|---|
| Q1：现有工具只读查询迁移（已限定实施并集成develop） | 首选`operationPage`：复用DesktopApi、OperationPage与原组件，由Query v5承接该范围的缓存、加载/错误与重复读取协调；删除ThreadPages中该范围被接管的通用机制。产品事件批次协调与工具页游标适配保留 | 精确发行/许可/类型准入、宿主环境身份、无网络本地查询、重连迟到结果、分页/焦点/审批回归均通过；同一范围只有一个缓存所有者。列出删掉与留下的职责，不以引入依赖或行数变化代替维护收益 |
| Q2：历史/成果同类通用职责（Q1及使用反馈证明收益后选择） | 按查询范围分批替换；沿用historyEntry、F01失效表、头部补齐与旧页链。原组件和产品契约继续使用 | 每个范围都保持同一组一致性/查询计数回归并删除旧同等机制；不要求长期保留两套生产实现 |
| 滚动与组件校正 | 对照C03既有行为校正小型适配与工具展开，不复制pi-gui完整driver/布局引擎 | 保留阅读意图、单一滚动控制者、草稿/焦点和审批可达；Virtual仍须实测需求触发，不借迁移制造虚拟化工作 |

首次复审只采纳计划；后续Q1已固定5.104.0，代码5b10b19，不能把v5主版本或示例blob当锁文件。首次源码核对基线为 `2ebd795445aea8f18581119d598f116309043d35`：ThreadPages仍用LoadedRange/operations Map和串行队列，Renderer维护pageBusy/pageProblem；这是首次复审的历史状态。Q1现由OperationQueries的QueryClient拥有工具数据，ThreadPages只存发布引用；历史/成果与产品批次协调仍保留。

### Q1必须补齐的产品接缝

- 查询键覆盖不含秘密的宿主/数据环境身份、连接代次、Thread/Run及查询种类；页身份进入独立页键或infinite query的pageParams，不能解析产品游标或用数据库绝对路径/凭据作键。Q1已由可信桥提供queryScope，HostClient绑定实际连接并校验期望身份；重连重建QueryClient，仅携带浏览位置。不能只用threadId/runId假定跨重连安全。
- 一个范围只由新缓存拥有。允许Q1工具查询与尚未迁移的历史/成果范围共存；不得把同一工具页再镜像到旧operations Map作为第二份可变缓存。只读组合视图与批次发布屏障属于产品展示协调，须说明其必要性。
- 同批实体去重，全部必要读取成功后才推进事件水位、发布完整显示；库逐查询成功不等于整批成功。保留F01正文2次查询、多页前插、300事件、失败/迟到/切换和未知事件断言；不用新库的逐项缓存更新削弱旧一致性。
- 有界IPC并发和背压继续生效；当前HostClient最多16个pending请求，库去重不等于限制不同查询的并发。实施需核验多Run刷新不会制造请求洪峰，不扩成通用调度器，也不增加限制值掩盖问题。
- 纯本地只读查询显式采用适合离线的调度设置，例如`networkMode: always`。它只控制查询库是否因浏览器离线状态暂停，不改变Worker/Shell网络权限，不适用于未经批准的模型调用。[官方网络模式](https://tanstack.com/query/latest/docs/framework/react/guides/network-mode)
- 显式配置staleTime、refetchOnMount/refetchOnWindowFocus/refetchOnReconnect、retry/retryOnMount与缓存回收策略。Q1默认禁用自动失败重试及窗口聚焦/网络重连重取，宿主重连仍走产品显式重同步；需要瞬时只读重试时另定有限次数、已知错误与可观察结果。无效游标、权限拒绝、超大条目不盲重试；错误UI/手动恢复路径保留。不得因默认过期、回收或maxPages驱逐而重读全部历史或丢失可见页。[官方默认行为](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults)
- 当前preload/HostClient没有AbortSignal或取消单次IPC的协议。`cancelQueries`不能证明已发送的宿主查询/进程停止；使用signal检查阻止后续未发出的页查询，并保留连接/请求代次与迟到结果隔离，真实取消传输能力未实现时如实标明。[官方取消语义](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation)
- 启动、审批、取消、recover和reconnect继续走原产品命令/控制流程；不包装为自动重试查询、不乐观显示为已执行。缓存不拥有费用、权限、原生历史或清理事实。活动/审批读取保持独立，不等待历史迁移完成。

### 迁移验收与回退

同一套既有行为断言比较固定旧基线与迁移提交；增加离线状态、焦点恢复、同ID跨数据环境、实际宿主重连与缓存隔离测试。方法查询计数、真实IPC延迟和实际UI体验分别记录；方法计数不冒充时延改进。集中运行受影响类型、模块、真实IPC与Electron检查，合成数据/Provider，不新增模型费用。

每个范围以独立可回退提交交付，报告精确版本、采用入口、删除的旧机制、保留适配和结果。不得顺带升级Pi、迁移数据库或改造UI。如果职责没有减少或一致性破坏，暂停该范围迁移、保留可用版本，记录具体差距；不因已引入库再叠第二层框架，也不重启无边界选型。

首次复核通过Context7定位并阅读Query v5官方默认、网络模式与取消说明；其中取消/网络模式另直接核对官方页面。属于接口行为依据，不是新依赖兼容或运行证据；示例main的选项仍须在未来所选精确发行包中核验。后端ProductCore/WorkspaceAdmission/Guardian/固定分页继续保留，durable维持P16差距评估门槛。

## 未关闭项与推进顺序

F01/F02的限定修正与本参考方向可以一并复审集成，不将全面Query迁移或虚拟化作为前置；F01修复也不表示通用查询复用工作已完成。Q1已完成限定工具范围并集成develop；后续Q2按维护收益选择范围，不要求迁移所有查询，不继续开放式列候选或扩建自有框架。若实际接缝无法满足上述边界，先记录具体差距与替代决定。

历史 `169df60` 在另一工作树的两次UI超时根因仍未定位。当前树通过及新增阶段诊断不能关闭该项；保留复现环境/阶段/退出结果的待办，不把整个审核包宣布全部关闭。F01/F02已集成develop；Q1已集成，进入同一真实profile的完整使用检查，Q2不是其前置，未关闭项继续跟踪，不能以付费调用调试刷新。

## 来源与本次维护范围

输入是用户提供的`frontend-backend-reuse-review-20260930`首次映射输入9文件：README、REVIEW、REUSE_OPTIONS、SOURCES、NEXT_STEPS、REFERENCE_IMPLEMENTATIONS、REREVIEW_AND_PLAN-96768a6、reproduce-query-counts.mjs及query-counts-96768a6.json。本文件将有用决定独立写入仓库；新克隆不需要本机tmp目录即可理解与复查。原包为历史审核/建议，保留不改，不充当新的产品运行证据。

原复现脚本只适用于96768a6旧反例：合成端口没有historyEntry且断言74/290，不是当前实现的验收脚本；当前使用仓库thread-pages.test.ts及上述报告中的命令。

本次基线 `28eeac6c8bcb5180685d653e0fce6da52597d741`，其上的文档差异只采纳模块映射、同步计划和来源；review证据不代表新SDK/模型/平台实测。任务/里程碑状态不晋级。本次没有新增运行功能；带来的变化是后续实现有具体参考、明确替换范围和不可丢失的产品边界。Skill评估：这是一次项目架构决定的维护，复用现有SSOT检查，不新增操作Skill。

文档验证：在上述基线加本次文档差异上运行项目Python环境的`check-ssot.py`（60/60）、`test-tools.py`（15/15）和`check-docs.py --structural-only`（5通过/2跳过）；输出在`.artifacts/reference-mapping/`。未重跑产品代码、Electron或模型测试，沿用既有证据的原SHA与范围。

迁移建议复审补充：输入新增EXISTING_CODE_MIGRATION.md，本次以2ebd795为代码核对基线，仅文档/计划变化；Q1/Q2均未实施，不继承前轮运行测试为迁移通过证据。现有Context7技能流程仍适用；该架构决策不另建Skill。

迁移复审文档验证：在`2ebd795445aea8f18581119d598f116309043d35`加本次文档差异上运行`.venv/bin/python scripts/check-ssot.py`（60/60）、`.venv/bin/python scripts/test-tools.py`（15/15）、`.venv/bin/python scripts/check-docs.py --structural-only`（5通过/2跳过）及`git diff --check`，均通过。原始输出在`.artifacts/existing-code-migration/`；此处为可随新克隆定位的结果摘要。未重跑产品、Electron或模型测试。

## Q1已采用入口（2026-09-30）

Query 5.104.0实际公开入口为根导出QueryClient；采用非deprecated的实例方法query，而不是把方法冒充根导出。工具加载/错误由QueryCache经React useSyncExternalStore订阅；工具分页不再写独立busy/error状态。不可变批次键是产品一致性屏障，成功后回收旧键，不是第二份数据缓存。历史/成果LoadedRange、产品串行批次、水位、游标和阅读锚点保留；明确删除与保留清单、失败、许可和测试见[报告](../validation/ui-query-tools-2026-09-30.md)。前面“首次/本次复审”段落记录原文档采纳范围，不覆盖本节的新实现事实。

Q1_PLAN_REVIEW复核补充：真实使用优先，不把全应用统一Query当作验收目标；Q2只有在具体范围能减少维护职责时才实施，否则保留当前正确查询。见[复核记录](../validation/q1-plan-rereview-2026-09-30.md)。


## 2026-10-03 UI 重构采用

[会话工作台契约](ui-experience-contract.md)追加固定 pi-gui timeline-item 工具摘要参考、React 焦点/失效处理及各模块保留边界。旧Q1迁移“不顺带改UI”仍约束查询迁移范围；本轮是用户另行授权的整套UI重构，未迁移Q2或替换缓存。权限模式官方对照属于下一设计，不是已实现自动审批。

## 2026-10-03 权限策略接入

[权限契约](permission-modes-contract.md)补齐模块→参考→采用→边界。复用上一批 Codex/Claude/OpenCode 官方模式对照；pi-gui继续只作会话/输入区域主参考，不搬其会话驱动取代本产品的宿主审批。实际 Pi 0.87.1工具/Operations继续走原适配，新增固定宿主规则和产品模式投影；React受控状态与按身份重挂载经Context7核对。自动模式的命令确认、Run快照与批准来源已接通，不含完全访问或模型分类器。

## 2026-10-03 三栏拖动与按需详情

固定C03提交 `163054227d370a49d09099c61eb65798481294ac` 的 [pane-resize-handle.tsx](https://github.com/minghinmatthewlam/pi-gui/blob/163054227d370a49d09099c61eb65798481294ac/apps/desktop/src/ui/pane-resize-handle.tsx) 和 [workbench-resize-handle.tsx](https://github.com/minghinmatthewlam/pi-gui/blob/163054227d370a49d09099c61eb65798481294ac/apps/desktop/src/features/workbench/workbench-resize-handle.tsx) 已在实施前读取，并核验同提交根MIT。前者仅依赖React，适合局部复用；后者的比例边界不直接适用本项目，改由pane-layout统一保障正文最小宽度与窄窗覆盖。

本项目 `pane-resize-handle.tsx` 局部适配其指针捕获、键盘、双击逻辑，宽度由布局所有者传入，移除第二套DOM测量，补取消/窗口失焦清理。`pane-layout.ts`只拥有宽度和本机显示偏好；会话数据、Pi Session、审批宿主与timeline-scroll单一滚动所有者均保留。Composer仍固定于旧C01提交，未偷偷更新来源。许可已补THIRD_PARTY_NOTICES.md，无新增依赖。

React事件及清理经Context7查询 [DOM事件](https://react.dev/reference/react-dom/components/common) 与 [Effect清理](https://react.dev/reference/react/useEffect)。本次不复用上游完整应用或会话驱动，实际证据见[三栏报告](../validation/pane-layout-2026-10-03.md)。

## 2026-10-03 会话内审批与阅读意图

实施前复读C03固定 `163054227d370a49d09099c61eb65798481294ac` 的timeline-item：按callId绑定工具卡片和展开状态。本项目沿用同一思路但身份是产品Operation，复用已有ApprovalList/宿主resolve/claim，不复制上游driver或假定Pi含本产品审批API。右栏只承担成果预览；历史失败时活动快照直接提供待决卡片。

滚动故障后重新读取同提交 `hooks/use-timeline-viewport.ts`：其“render不是scroll请求”和expectedScrollTop区分自身滚动的规则适用于本项目。只收敛已有timeline-scroll的恢复触发与自身事件识别，不移植虚拟化、估高或第二套滚动状态机。React key/refs/Effect经Context7核对。

`model-services.ts`仍经已安装Pi0.87.1公开ResourceLoader/getSystemPrompt接入（发行包docs/sdk.md与实际类型已核对），文案改为宿主人工/自动授权；不新增模式推断、工具或授权旁路。模块边界及实际被测SHA见[本批报告](../validation/inline-approval-2026-10-03.md)。

## 完全访问平台策略（2026-10-04）

`macos-access.ts` → [Anthropic sandbox-runtime固定Mac源码](https://github.com/anthropics/sandbox-runtime/blob/9e93406ab2e0b6e9794624896f729560dc9445db/src/sandbox/macos-sandbox-utils.ts) → 参考拒绝优先级、目录例外/祖先移动保护与同沙箱进程边界 → 保留本产品guardian/审批/收据/固定Node，不安装或移植其通用runtime。源码与Apache-2.0许可证blob已独立核对，具体映射、限定验证与不采用整包的原因见[平台报告](../validation/full-access-platform-2026-10-04.md)。Pi公开Operations、pi-gui主UI参考不变，产品full模式尚未开放。

## 2026-10-04 会话命名采用

[命名契约](thread-naming-contract.md)列出pi-gui固定sidebar/use-thread-actions、React身份/清理与Pi0.87.1公开类方法的逐模块映射。只借鉴行内编辑；产品Thread先于Session存在，继续用宿主事务命名，不调用Pi方法双写原生历史，也不移植社区驱动或新增依赖。

## 安全正文阅读采用（2026-10-04）

模块→参考/API→采用范围→保留边界详见[安全阅读契约](safe-reading-contract.md)。继续固定pi-gui `163054227d370a49d09099c61eb65798481294ac`的message-markdown/timeline-item，采用同类Markdown/GFM渲染与memo行为；没有复制新社区组件。实际依赖为react-markdown10.1.0和remark-gfm4.0.1，MIT、registry/tarball/SRI/安装文件/实际import见[发行输入](../validation/safe-reading-inputs-2026-10-04.json)。Pi0.87.1公开parseSessionEntries、SessionManager.inMemory/getBranch/getEntry负责解析和原生分支；不采用有磁盘迁移行为的SessionManager.open作查看器，不使用未根导出的loadEntriesFromFile。宿主仍拥有路径/Run范围、过滤与连接隔离，Renderer没有SDK/导航权限。实际采用与未覆盖项见[被测报告](../validation/safe-reading-2026-10-04.md)。

## 恢复与审批连续操作（2026-10-04）

[本批映射及复审](../validation/workflow-review-2026-10-04.md)继续核对固定pi-gui `163054227d370a49d09099c61eb65798481294ac`的use-session-composer.tsx：保留失败输入、操作后的焦点处理。只借鉴行为，本项目仍保留产品requestId、宿主清理/替换和单一滚动所有者；不复制新组件或新增依赖。本机早期checkout为另一个提交，已明确不混作本次固定参考。恢复状态拆分属于业务逻辑修复，不另建通用错误/状态框架。

## 会话目录采用（2026-10-04）

完整“本项目模块→固定参考/API→采用→边界”见[目录契约](thread-directory-contract.md)。复读C03固定163054227d370a49d09099c61eb65798481294ac的sidebar.tsx，仅借鉴选中会话独立、编辑目标保留行为，没有新增社区片段。Query 5.104.0根级运行时useInfiniteQuery已核对声明和实际ESM，与QueryClient共同管理新目录页；Context7 main文档仅辅助理解，不当作发行依据。宿主沿用已有SQLite keyset/字节约束，Renderer不建全库镜像、Session索引或第二套分页缓存；证据见[报告](../validation/thread-directory-2026-10-04.md)。

## 阅读操作采用（2026-10-04）

[逐模块映射](reading-actions-contract.md)核对C03固定message-markdown/timeline-item/file-editor-pane：仅借鉴就地复制/预览动作，固定上游没有可直接采用的消息/代码复制组件。沿用react-markdown10.1.0公开pre/node和Electron44.4.5异步clipboard.writeText；声明/实际运行核验与Context7 main资料分开。主进程只写纯文本窄桥不开放读取权限、任意文件或通用IPC；版本只用原宿主核验及本会话已加载元数据。无新依赖/社区片段，见[验证](../validation/reading-actions-2026-10-04.md)。

## 窄窗导航与最终状态（2026-10-04）

`pane-layout/renderer/thread-directory` → C03固定pi-gui `sidebar.tsx`、`conversation-timeline.tsx` → 选择身份独立、条件焦点、栏宽限制和唯一阅读所有者 → 保留宿主目录/权限/确认，不复制DnD/driver。覆盖导航另按WAI APG dialog模式处理inert/Tab/Escape/返回焦点。`run-status-notice`只读取产品宿主Run终态变化，不从Pi或界面空闲推测完成。

Electron44.4.5的webContents缩放/键盘/debugger实例方法仅用于真实窗口测试，未新增Renderer权限。所查来源、实测SHA、失败和VoiceOver限制见[报告](../validation/experience-review-2026-10-04.md)；没有新增社区组件或依赖。
