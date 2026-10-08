# 分散设计文档收口清单

2026-10-08。本次主动迁移现行设计规则，旧链接保留可定位入口；不把旧报告内容复制为新规则。新树目标规格仍待实施，文档迁移没有改变产品功能。

| 原位置/内容 | 唯一去向 | 原文件处理 |
|---|---|---|
| ui-design-principles：通用原则/分层/设计验收 | [principles](principles.md) | 原页缩为兼容索引，不再维护规则正文 |
| ui-design-principles：权限示范/区域表 | [PERMISSION](shell/workspace/conversation/composer/permissions.md)及对应空间节点 | 移除平行的详细示范/区域规格；父树统一导航 |
| ui-experience-contract：整体布局、尺寸、拖宽、覆盖 | [SHELL](shell/README.md)、[FOUNDATIONS](foundations.md)、[MOTION](motion.md) | 原大段布局/累积呈现描述归并；仅保留业务不变量、采用记录及历史证据入口 |
| ui-experience-contract：侧栏、标题、输入、审批、成果、复制 | [NAV](shell/navigation.md)、[WORK](shell/workspace/README.md)及子节点 | 每个空间一处详细规格，现状/差距随节点标明 |
| ui-experience-contract：恢复、终态、跨会话入口 | [FEEDBACK](shell/workspace/feedback.md) | 呈现归节点；只读/确认/重连区别仍是业务边界 |
| permission-modes-contract：桌面入口呈现 | [PERMISSION](shell/workspace/conversation/composer/permissions.md)、[TOOLS](shell/workspace/conversation/tools.md) | 删除重复的目标控件描述；保留确认/版本/Run固定/权限范围与历史来源 |
| reading-actions/safe-reading：按钮、预览、焦点/安全展示 | [MESSAGES](shell/workspace/conversation/messages.md)、[PREVIEW](shell/workspace/artifacts/preview.md) | 加明确权威路由，预览焦点规则移交；复制内容、安全过滤、身份/IPC限制留在业务契约 |
| thread-directory/thread-naming：导航/改名呈现 | [NAV](shell/navigation.md) | 路由到节点；查询、IME提交、持久命名、冲突/幂等保留原契约 |
| c-desktop-contract：早期最小桌面安排 | [规格树](README.md) | 标明早期范围与新树优先；不删除进程/安全接缝及采用事实 |
| AGENTS、Skill、NEXT_STEPS、docs入口 | [规格树](README.md)＋Skill维护流程 | 从散读多个布局段落改为根→共享→父→子；计划仍单线 |

## 未迁移为设计规范的内容

`docs/validation/`的竞品研究、审核、测试结果保留历史输入身份；`docs/startup/`完全不动。`reuse-map.json`、reference-implementations及业务契约仍管理Pi/社区采用、所有权和验证事实。树内重复提及关键安全事实是引用式约束，不是另一套协议定义。

本次未把未实现的文件编辑器、市场、设置中心等预先铺成目录。新增功能将按实际授权和父节点职责增补。所有节点以本轮源码基线作现状对照；后续实现时更新对应差距和证据，不能把整棵树统一标“完成”。
