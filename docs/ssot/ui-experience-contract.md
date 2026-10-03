# 会话工作台 UI 与权限入口

2026-10-03。继承 [桌面契约](c-desktop-contract.md) 和 [指定参考实现](reference-implementations.md)，覆盖旧界面的布局安排，不修改宿主、Pi Session、审批和工具权限的既有所有权。当前代码及限定验证见 [重构报告](../validation/ui-refactor-2026-10-03.md)。

## 整体结构

以会话为主：左侧只管理工作目录与会话，顶部只显示当前会话、目录和即时动作，正文获得主要空间，底部固定输入。新会话名称是可选展开项；列表同时显示目录与短身份，避免同名会话完全不可辨认。现支持宿主持久重命名，侧栏就地编辑、冲突保留输入与同请求重试，见[命名契约](thread-naming-contract.md)。尚无自动语义标题，不伪造创建时间。

右侧只放成果版本和按需核验预览，默认关闭，用户显式开合按会话保留；不会因新审批或成果自动抢占正文。顶部待审批入口定位会话内卡片，必要时关闭覆盖详情；停止始终独立于历史/侧栏。运行中的停止只有一个常驻入口；排队记录保留各自取消排队。

左右分隔线现支持真实指针拖动、方向键20px微调、Home/End到边界、双击或Enter复位。导航栏可收起，宽度和导航开合只保存在Renderer本机布局偏好，不写产品权限或Run状态；无效/不可写存储回退默认或内存。拖动结束、失去捕获、取消和窗口失焦都停止调宽。窗口缩小时只限制当前显示宽度，不覆盖用户偏好。

宽窗口为导航/会话/详情三块，会话至少保留360px；低于1000px时详情成为覆盖层，不继续压缩正文。覆盖范围内正文不可点击或键盘操作，关闭按钮、Escape或背景点击可关闭，焦点返回顶部详情入口；顶部审批/停止和导航仍可操作。当前最小窗口820×640。详情原有按会话开合/页签不变。限定实现与实测见[三栏报告](../validation/pane-layout-2026-10-03.md)。

审批按宿主Operation身份直接放在该任务的操作记录中，批准/拒绝后由原身份的结果摘要替代；不按时间或位置猜测正文与工具交错。按钮只来自独立活动快照的pending操作，历史页内过时pending不产生有效按钮。历史未载入/失败或当前Run不在已读页时，在会话底部以“当前任务等待确认 · 历史尚未载入”承接同一操作；历史成功后只保留一张卡片。慢历史查询、详情关闭均不移除顶部待审批/停止入口。

顶部定位与原阅读恢复均由timeline-scroll拥有。定位聚焦卡片，日常轮询/新审批不强抢焦点；按会话载入或实际ResizeObserver变化恢复阅读位置，不因每次DTO对象变化滚动。自身定位的迟到scroll事件不改变阅读意图。限定实测和开发失败记录见[行内审批报告](../validation/inline-approval-2026-10-03.md)。

正文保持原生安全投影的顺序；产品操作单独分区，不按 ID 或位置猜测两者的交错关系。工具输出和用量元信息默认折叠；原 Operation 身份对应的 DOM 保持展开状态。尚未实现真正穿插时间线；Markdown和按Run原生正文补读已按[安全阅读契约](safe-reading-contract.md)限定接入。旧Run缺范围、超8MiB Session及附件等不能补读，不宣称无限历史或全部原生内容展示。

审批默认展示具体目标、简短影响、期限和一次允许/拒绝。完整目录与校验信息可展开。参数摘要、当前绑定、版本、期限和一次领取仍由宿主校验；收起字段不改变其效力。Bash 风险和工具结果发送给模型的事实可见。

成果按登记版本计数，不称为独立文件数；有后续页时标明“+”。预览紧邻选中版本，包含路径/版本/核验时间；只在用户选择时定位并聚焦，关闭返回原条目。切会话或宿主连接身份变化会废弃旧预览。全文仍是宿主核验后的受限纯文本，不扩大读取权限。

普通请求失败提供只读刷新，不重启宿主、不重发命令；未确认意图仍由用户显式重试同一 requestId。断线才提供有后果说明的重连。慢刷新不阻塞停止；迟到读取受会话代次保护，不清除新错误。

2026-10-04恢复收口：连接状态、只读加载错误与命令未确认分别维护。当前代次的成功home/活动读取才解除连接/读取提示，不自动确认命令；旧读取不能清除较新的错误。真正重连开始时失效旧轮询，沿用HostClient停止/替换，不重发意图。操作前保存实际审批焦点；原控件移除且用户没有转移焦点时，定位下一审批或回输入区，不将“已不再待审批”称为任务已完成。限定测试及剩余辅助技术范围见[工作流复审](../validation/workflow-review-2026-10-04.md)。

## 参考与采用

| 本项目模块 | 固定参考/API | 本轮采用 | 保留边界 |
|---|---|---|---|
| renderer/run-history/style | pi-gui `163054227d370a49d09099c61eb65798481294ac` 的 conversation-timeline.tsx、timeline-item.tsx；前次研究中的工作台布局 | 借鉴会话优先、错误独立处理、工具默认紧凑/按身份展开；重写本项目展示与 CSS | 未复制社区组件或 SessionDriver；产品 DTO 与已有查询/滚动所有者保留 |
| pane-resize-handle / pane-layout / renderer | pi-gui同提交 `ui/pane-resize-handle.tsx`、`features/workbench/workbench-resize-handle.tsx`；React Pointer Events | MIT分隔条局部适配：捕获指针、键盘和复位；本项目单一布局所有者提供宽度/边界，增加失焦清理与本地偏好 | 不复制其布局/Session驱动；不新增依赖、跨进程入口、权限或滚动位置控制者 |
| artifact-panel | React 19.3.0 的 useRef/useLayoutEffect；既有 DesktopApi.preview | 条件渲染后定位/聚焦，连接身份隔离 | 不添加任意文件读取；正文/工具/成果均不透传 SDK 对象 |
| renderer 错误动作 | 既有 home/threadActivity 与 HostClient.reconnect；React 异步结果失效说明 | 区分只读刷新、显式意图重试和重启宿主 | 无新的通用请求框架、自动重试或第二套缓存 |

固定 pi-gui 文件：[timeline](https://github.com/minghinmatthewlam/pi-gui/blob/163054227d370a49d09099c61eb65798481294ac/apps/desktop/src/features/conversation/conversation-timeline.tsx)、[timeline-item](https://github.com/minghinmatthewlam/pi-gui/blob/163054227d370a49d09099c61eb65798481294ac/apps/desktop/src/features/conversation/timeline-item.tsx)。根 MIT 已在前次研究核对；前一重构批次是行为借鉴；后续三栏批次另移植固定提交的分隔条，来源/许可见THIRD_PARTY_NOTICES.md。原 Composer 的来源与许可不变。React 文档经 Context7 核对 [异步响应清理](https://react.dev/learn/synchronizing-with-effects) 和 [DOM refs](https://react.dev/learn/manipulating-the-dom-with-refs)。

## 权限模式：社区事实与当前接入

用户指出产品不应永久围绕逐操作人工审批布局。2026-10-03核对官方资料：

- [Codex](https://learn.chatgpt.com/docs/sandboxing)：菜单可包含 Ask for approval、Approve for me、Full access。审批决定何时询问，sandbox 决定文件/网络范围；代审不自动移除 sandbox。
- [Claude Code](https://code.claude.com/docs/en/permission-modes)：Manual、acceptEdits、Auto、Plan、bypassPermissions 等模式；Auto 有独立分类器，不等同“所有操作都允许”。不同界面/配置的可用模式不同。
- [OpenCode](https://opencode.ai/docs/permissions/)：allow/ask/deny 规则；询问可选择 once/always/reject，其中 always 按工具给出的模式在当前会话内持续生效。不是所有产品都恰好三个相同档位。

本项目采用三档入口：人工审批、自动审批、完全访问。**三档已在限定macOS范围接通；完全访问扩大到目录外文本工具与Bash IP网络，保留宿主私有目录和运行代码保护。** 详见[权限模式契约](permission-modes-contract.md)。自动审批采用宿主固定规则与既有 Operation 一次领取，不引入模型分类调用，不扩大执行范围；不能将其宣传为智能风险审核。

权限模式入口放在输入区域，正常阅读不常驻大审批面板；仅待决操作出现紧凑卡片。完全访问的 OS 范围、产品保留目录及变更生效时机须明确，不能把隐藏提示或跳过前端按钮当作实现。模式变化仍由宿主核验并记录；Worker/Renderer 不能自报权限。模式切换只影响之后接收的任务，不追溯修改当前运行或已经排队的任务。活动任务行显示其接收时固定模式，输入区域显示后续新任务模式。模型提示统一声明每个操作需宿主授权（人工确认或已批准的自动规则）；不给Worker新增自行选择权限的入口。

2026-10-04集中回归补充：按照pi-gui固定viewport参考，栏宽/内容变化产生的浏览器滚动不能自动解释为用户改变阅读意图；真正滚轮/键盘/滚动条输入另行识别。右栏布局完成后仍跟随最新，阅读旧记录时保留Run锚点，成果预览不移动正文。[失败、修订和实测范围](../validation/full-access-product-2026-10-04.md)。
