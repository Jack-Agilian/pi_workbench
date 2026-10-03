# 会话工作台 UI 与权限入口

2026-10-03。继承 [桌面契约](c-desktop-contract.md) 和 [指定参考实现](reference-implementations.md)，覆盖旧界面的布局安排，不修改宿主、Pi Session、审批和工具权限的既有所有权。当前代码及限定验证见 [重构报告](../validation/ui-refactor-2026-10-03.md)。

## 整体结构

以会话为主：左侧只管理工作目录与会话，顶部只显示当前会话、目录和即时动作，正文获得主要空间，底部固定输入。新会话名称是可选展开项；列表同时显示目录与短身份，避免同名会话完全不可辨认。尚无持久重命名或自动语义标题，不伪造创建时间。

右侧是按需详情，分为审批和成果两页。空会话默认隐藏；有待审批或成果时可显示。用户手动收起/选择页面按会话保留，不因新审批强抢焦点。顶部待审批入口与停止始终独立于历史/侧栏。运行中的停止只有一个常驻入口；排队记录保留各自取消排队。

正文保持原生安全投影的顺序；产品操作单独分区，不按 ID 或位置猜测两者的交错关系。工具输出和用量元信息默认折叠；原 Operation 身份对应的 DOM 保持展开状态。未实现真正穿插时间线、Markdown 渲染或原生全文补载。

审批默认展示具体目标、简短影响、期限和一次允许/拒绝。完整目录与校验信息可展开。参数摘要、当前绑定、版本、期限和一次领取仍由宿主校验；收起字段不改变其效力。Bash 风险和工具结果发送给模型的事实可见。

成果按登记版本计数，不称为独立文件数；有后续页时标明“+”。预览紧邻选中版本，包含路径/版本/核验时间；只在用户选择时定位并聚焦，关闭返回原条目。切会话或宿主连接身份变化会废弃旧预览。全文仍是宿主核验后的受限纯文本，不扩大读取权限。

普通请求失败提供只读刷新，不重启宿主、不重发命令；未确认意图仍由用户显式重试同一 requestId。断线才提供有后果说明的重连。慢刷新不阻塞停止；迟到读取受会话代次保护，不清除新错误。

## 参考与采用

| 本项目模块 | 固定参考/API | 本轮采用 | 保留边界 |
|---|---|---|---|
| renderer/run-history/style | pi-gui `163054227d370a49d09099c61eb65798481294ac` 的 conversation-timeline.tsx、timeline-item.tsx；前次研究中的工作台布局 | 借鉴会话优先、错误独立处理、工具默认紧凑/按身份展开；重写本项目展示与 CSS | 未复制社区组件或 SessionDriver；产品 DTO 与已有查询/滚动所有者保留 |
| artifact-panel | React 19.3.0 的 useRef/useLayoutEffect；既有 DesktopApi.preview | 条件渲染后定位/聚焦，连接身份隔离 | 不添加任意文件读取；正文/工具/成果均不透传 SDK 对象 |
| renderer 错误动作 | 既有 home/threadActivity 与 HostClient.reconnect；React 异步结果失效说明 | 区分只读刷新、显式意图重试和重启宿主 | 无新的通用请求框架、自动重试或第二套缓存 |

固定 pi-gui 文件：[timeline](https://github.com/minghinmatthewlam/pi-gui/blob/163054227d370a49d09099c61eb65798481294ac/apps/desktop/src/features/conversation/conversation-timeline.tsx)、[timeline-item](https://github.com/minghinmatthewlam/pi-gui/blob/163054227d370a49d09099c61eb65798481294ac/apps/desktop/src/features/conversation/timeline-item.tsx)。根 MIT 已在前次研究核对；本轮是行为借鉴，不新增片段移植。原 Composer 的来源与许可不变。React 文档经 Context7 核对 [异步响应清理](https://react.dev/learn/synchronizing-with-effects) 和 [DOM refs](https://react.dev/learn/manipulating-the-dom-with-refs)。

## 权限模式：社区事实与下一设计，不是本轮已实现能力

用户指出产品不应永久围绕逐操作人工审批布局。2026-10-03核对官方资料：

- [Codex](https://learn.chatgpt.com/docs/sandboxing)：菜单可包含 Ask for approval、Approve for me、Full access。审批决定何时询问，sandbox 决定文件/网络范围；代审不自动移除 sandbox。
- [Claude Code](https://code.claude.com/docs/en/permission-modes)：Manual、acceptEdits、Auto、Plan、bypassPermissions 等模式；Auto 有独立分类器，不等同“所有操作都允许”。不同界面/配置的可用模式不同。
- [OpenCode](https://opencode.ai/docs/permissions/)：allow/ask/deny 规则；询问可选择 once/always/reject，其中 always 按工具给出的模式在当前会话内持续生效。不是所有产品都恰好三个相同档位。

本项目拟采用易理解的三档入口：人工审批、自动审批、完全访问。**当前只有逐项人工审批实现；另外两档是候选能力，未启用，也没有伪造可切换按钮。** 下一增量先确定每档的实际目录、网络、工具和审批范围，再将宿主持久策略、Run 绑定和界面入口一起交付。自动审批优先评估明确规则与既有 Operation 一次领取，不默认引入额外模型分类调用；如采用模型审核，须另核对适配与故障行为。

权限模式入口放在输入区域，正常阅读不常驻大审批面板；仅待决操作出现紧凑卡片。完全访问的 OS 范围、产品保留目录及变更生效时机须明确，不能把隐藏提示或跳过前端按钮当作实现。模式变化仍由宿主核验并记录；Worker/Renderer 不能自报权限。下一设计不自动修改真实用户会话或当前运行。
