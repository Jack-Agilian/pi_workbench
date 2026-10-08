# 会话工作台：契约边界与设计迁移入口

2026-10-08收口。原文件的布局、尺寸、控件呈现、焦点与滚动体验要求已按[迁移清单](ui/migration.md)归并到[UI规格树](ui/README.md)。本页保留产品边界和既有采用记录，不再添加新的空间设计段落。新树区分目标规格与源码现状，不把待实现设计冒充已有行为。

## 保留的产品边界

- UI只认识产品协议。正文与Operation按可信身份分区，不按时间/位置猜测交错；Pi Session历史仍归Pi，宿主是Run/审批/结算权威。
- 待批按钮来自独立活动快照；历史失败/未载入仍可处理相同Operation，不能出现两份有效审批或因页面折叠执行工具。
- 只读刷新、显式同请求确认、结束旧宿主的重连是不同动作；迟到数据不能覆盖新会话或解除新的错误。重连不重放意图。
- Thread模式影响后续接收任务，活动/排队Run使用已固定模式。自动审批与完全访问的范围、保护及确认规则由[权限契约](permission-modes-contract.md)持有。
- 名称/目录查询归[命名](thread-naming-contract.md)与[分页](thread-directory-contract.md)契约；正文/复制/成果读取归[安全阅读](safe-reading-contract.md)与[阅读动作](reading-actions-contract.md)契约。
- 终态只取宿主实际结算，Pi结束或activeRun消失不等于完成。原生代理操作、用户人工体验与VoiceOver分别留证，当前UI任务不因规格迁移晋级。

## 既有事实与证据

当前实现事实由源码及[当前计划](../planning/NEXT_STEPS.md)引用的逐批报告定位。原[整体重构](../validation/ui-refactor-2026-10-03.md)、[栏宽布局](../validation/pane-layout-2026-10-03.md)、[行内审批](../validation/inline-approval-2026-10-03.md)、[工作流修订](../validation/workflow-review-2026-10-04.md)、[布局/状态验收](../validation/experience-review-2026-10-04.md)、[跨会话执行](../validation/cross-thread-2026-10-04.md)保留历史范围；没有改写其结果。

## 参考与采用

| 本项目模块 | 固定参考/API | 既有采用 | 保留边界 |
|---|---|---|---|
| renderer/run-history/style | pi-gui `163054227d370a49d09099c61eb65798481294ac` 的 conversation-timeline.tsx、timeline-item.tsx；前次研究中的工作台布局 | 借鉴会话优先、错误独立处理、工具默认紧凑/按身份展开；重写本项目展示与 CSS | 未复制社区组件或 SessionDriver；产品 DTO 与已有查询/滚动所有者保留 |
| pane-resize-handle / pane-layout / renderer | pi-gui同提交 `ui/pane-resize-handle.tsx`、`features/workbench/workbench-resize-handle.tsx`；React Pointer Events | MIT分隔条局部适配：捕获指针、键盘和复位；本项目单一布局所有者提供宽度/边界，增加失焦清理与本地偏好 | 不复制其布局/Session驱动；不新增依赖、跨进程入口、权限或滚动位置控制者 |
| artifact-panel | React 19.3.0 的 useRef/useLayoutEffect；既有 DesktopApi.preview | 条件渲染后定位/聚焦，连接身份隔离 | 不添加任意文件读取；正文/工具/成果均不透传 SDK 对象 |
| renderer 错误动作 | 既有 home/threadActivity 与 HostClient.reconnect；React 异步结果失效说明 | 区分只读刷新、显式意图重试和重启宿主 | 无新的通用请求框架、自动重试或第二套缓存 |

固定 pi-gui 文件：[timeline](https://github.com/minghinmatthewlam/pi-gui/blob/163054227d370a49d09099c61eb65798481294ac/apps/desktop/src/features/conversation/conversation-timeline.tsx)、[timeline-item](https://github.com/minghinmatthewlam/pi-gui/blob/163054227d370a49d09099c61eb65798481294ac/apps/desktop/src/features/conversation/timeline-item.tsx)。根 MIT 已在前次研究核对；前一重构批次是行为借鉴；后续三栏批次另移植固定提交的分隔条，来源/许可见THIRD_PARTY_NOTICES.md。原 Composer 的来源与许可不变。React 文档经 Context7 核对 [异步响应清理](https://react.dev/learn/synchronizing-with-effects) 和 [DOM refs](https://react.dev/learn/manipulating-the-dom-with-refs)。
