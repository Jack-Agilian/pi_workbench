# 前后端指定参考实现与采用边界

2026-09-30采纳。本文是[复用优先架构](reuse-first.md)的模块级补充；当前实施顺序只由[NEXT_STEPS](../planning/NEXT_STEPS.md)决定。指定参考方向不等于已安装依赖、移植组件、验证发行或完成任务。

## 本项目模块与具体接缝

下表上游文件路径相对相应上游仓库；本项目路径相对本仓库。来源编号见[上游证据](upstream-evidence.md)。

| 本项目模块 | 参考文件／API | 借鉴或替换范围 | 保留边界与当前状态 |
|---|---|---|---|
| `apps/desktop/renderer.tsx`、`run-history.tsx` | pi-gui `apps/desktop/src/features/conversation/conversation-timeline.tsx` [C03] | 主要桌面应用参考：分离加载/错误展示与时间线，按工具身份保存展开状态；选择可独立适配的组件或行为 | 产品DTO、Run/Operation身份、审批/成果语义不随组件改变。尚未移植这份时间线；原Composer移植沿用C01历史来源 |
| `apps/desktop/thread-pages.ts`及Renderer查询状态 | `@tanstack/react-query` v5：`QueryClient`、`useQuery`、`useInfiniteQuery`；TanStack/query `examples/react/infinite-query-with-max-pages/src/pages/index.tsx` [L04] | 通用查询缓存、加载/错误状态和重复读取合并的指定替换方向；实际迁移删除原同等职责，不并存两套缓存 | 产品事件到查询键的映射、Thread/Run归属、事件水位、页游标和既有IPC保留。当前F01薄适配仍运行，未安装Query；不继续扩展成通用查询框架 |
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

TanStack Query示例的审核包blob为 `29fac3d44a2af68d06950a3b9bfbbf64d9383cbe`，Virtual示例为 `5e4b2b7e0cae6e47aa592770ba976f4879e23998`。包内没有给出两个示例所属完整提交，本文保留其资料身份，不将滚动main链接或blob当作已核验发行版本。正式采用须补齐固定源码/许可证、实际registry精确版本、exports/类型与接缝验证，复用唯一npm锁；本次不安装候选或修改依赖。

durable继续对照P16固定 `1b347794e2a630e4359f2584f4eea388145d0ddf`；源码0.99.1/Experimental与本项目已安装Pi0.87.1分开，不把类方法和源码实现冒充已安装包根导出。

## 迁移必须保留的回归

1. F01已在 `e7764e46df3cb8bc3fcdcddc992246ebccfde95c` 限定修正：[实际证据](../validation/ui-targeted-refresh-2026-09-30.md)。64/256条已读历史的一次纯正文更新均为events+historyEntry两次方法查询；这是合成端口计数，不是IPC延迟或模型调用。迁移库必须保留同一断言，不得每次事件失效整个无限页集合。
2. 新记录跨页补齐、旧尾游标、300事件分批消费、批次失败保留完整旧视图和水位、未知事件重同步、会话切换停止后续读取均保留。缓存不能以较新快照跳过未消费事件，不能自动重试启动/审批/取消命令。
3. 不照抄示例maxPages=3裁掉当前可见旧页；未具备双向恢复前保持现有浏览语义。只迁移通用职责，不要求先建立两套生产实现进行比较。
4. 滚动借鉴以旧页前插、流式增长不打断阅读、工具展开/栏宽改变、会话切换、草稿/焦点和审批/停止可达为验收；不把复杂自研滚动引擎作为默认下一步。
5. durable采用前逐项核对Session迁移、审批/幂等、未知工具结果、取消结算、宿主及后代清理、费用账本和观察背压。工具中断结果本身不能证明macOS后代已清理。

## 未关闭项与推进顺序

F01/F02的限定修正与本参考方向可以一并复审集成，不将全面Query迁移或虚拟化作为前置；F01修复也不表示通用查询复用工作已完成。后续扩展查询能力时按本表采用Query方向，不继续开放式列候选或扩建自有框架。若实际接缝无法满足上述边界，先记录具体差距与替代决定。

历史 `169df60` 在另一工作树的两次UI超时根因仍未定位。当前树通过及新增阶段诊断不能关闭该项；保留复现环境/阶段/退出结果的待办，不把整个审核包宣布全部关闭。当前唯一事项仍为F01/F02交付复审与develop集成准备；之后按同一真实profile做完整人工使用检查，未关闭项继续跟踪，不能以付费调用调试刷新。

## 来源与本次维护范围

输入是用户提供的`frontend-backend-reuse-review-20260930`全包9文件：README、REVIEW、REUSE_OPTIONS、SOURCES、NEXT_STEPS、REFERENCE_IMPLEMENTATIONS、REREVIEW_AND_PLAN-96768a6、reproduce-query-counts.mjs及query-counts-96768a6.json。本文件将有用决定独立写入仓库；新克隆不需要本机tmp目录即可理解与复查。原包为历史审核/建议，保留不改，不充当新的产品运行证据。

原复现脚本只适用于96768a6旧反例：合成端口没有historyEntry且断言74/290，不是当前实现的验收脚本；当前使用仓库thread-pages.test.ts及上述报告中的命令。

本次基线 `28eeac6c8bcb5180685d653e0fce6da52597d741`，其上的文档差异只采纳模块映射、同步计划和来源；review证据不代表新SDK/模型/平台实测。任务/里程碑状态不晋级。本次没有新增运行功能；带来的变化是后续实现有具体参考、明确替换范围和不可丢失的产品边界。Skill评估：这是一次项目架构决定的维护，复用现有SSOT检查，不新增操作Skill。

文档验证：在上述基线加本次文档差异上运行项目Python环境的`check-ssot.py`（60/60）、`test-tools.py`（15/15）和`check-docs.py --structural-only`（5通过/2跳过）；输出在`.artifacts/reference-mapping/`。未重跑产品代码、Electron或模型测试，沿用既有证据的原SHA与范围。
