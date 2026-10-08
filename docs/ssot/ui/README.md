# 工作台空间与控件规格树

2026-10-08建立。这里是**界面空间、尺寸、布局与交互呈现的详细权威**；[通用原则](principles.md)管原则，业务契约管权限/身份/副作用，[当前计划](../../planning/NEXT_STEPS.md)管顺序，Skill管维护方法。详细空间规则不再分散新增到历史契约中。冲突时先报告并同步修订，不用视觉规格覆盖业务边界。

本树v2已根据[70项审核](../../validation/ui-control-audit-2026-10-08.md)和[可交互的完整流程原型](../../design/workbench-prototype/README.md)纠偏：文档正文成为右栏主角，当前审批集中在输入区，目录对象与普通记录分层。本批已成组实施到正式Renderer；复用原业务链路，未改宿主权限/协议。限定验证见后续实现报告，不扩大完整产品/Gate验收。

打开[交互原型](../../design/workbench-prototype/index.html)查看默认、待批、未确认、断线、未知、文档改变与长内容状态。共享参数及各节点已同批修订；产品实现以当前节点及源码为准，旧基线bbc4e17只用于审核对照。共享数值不冒充社区标准，审批位置新增固定OpenCode/T3 Code源码依据，原型说明列出采用边界。业务权限/身份/恢复不变量继续生效。

## 阅读树

- [通用设计原则](principles.md)与[旧文档收口清单](migration.md)。

- [共享尺寸与视觉参数](foundations.md)：数值、单位、空间预算。
- [共享动效与层级](motion.md)：开合、拖动、减少动态效果、焦点时序。
- [SHELL 工作台窗口](shell/README.md)
  - [NAV 导航侧栏](shell/navigation.md)：品牌/关闭、目录、新建、查找、会话行/改名、连接状态。
  - [WORK 主工作区](shell/workspace/README.md)
    - [HEAD 会话顶部](shell/workspace/header.md)：导航开关、标题/目录、停止、文档入口、上下文。
    - [FEEDBACK 配置与反馈](shell/workspace/feedback.md)：模型配置、连接、跨会话运行、恢复与终态。
    - [CHAT 会话区](shell/workspace/conversation/README.md)
      - [MESSAGES 阅读记录](shell/workspace/conversation/messages.md)：空态、分页、正文、代码、复制、返回最新。
      - [TOOLS 工具与审批](shell/workspace/conversation/tools.md)：历史摘要/输出、输入区当前审批、目标/风险与结果。
      - [COMPOSER 输入区](shell/workspace/conversation/composer/README.md)：草稿、工具栏、发送、提示、演示入口。
        - [PERMISSION 权限选择器](shell/workspace/conversation/composer/permissions.md)：当前值、气泡、选择面板、保存反馈。
    - [ARTIFACTS 文档面板](shell/workspace/artifacts/README.md)：当前文件/关闭、文档选择、登记分页、按需说明。
      - [PREVIEW 文档阅读](shell/workspace/artifacts/preview.md)：正文优先、异常核验、复制、次级版本/来源。

这是一棵**产品空间树**，不要求一比一复制React组件树。简单子控件放父文档的子节点表；有独立布局/多状态/复用职责时才拆文件。共用气泡、分隔条和反馈规则引用共享节点，不复制成多份。新增实际区域必须在父节点和此索引登记，不能只新增一个孤立文档。

## 节点填写与维护

每个空间节点都有稳定ID、父节点、职责/非职责、子区域表（位置/尺寸/展示与动作）、状态/溢出/键盘要求、代码归属、现状/差距和验收。数值引用共享参数；不适用项写清原因，不机械创建空章节。模板与变更步骤见[Skill维护流程](../../../.agents/skills/workbench-ui-design/references/space-spec-maintenance.md)。

变更前读根、共享规则、全部祖先和目标节点，再查被影响的兄弟与子节点。变更布局约束时先改持有它的父节点；文案/局部状态改对应叶节点。移动/删除区域时同步父子链接、此索引、源码归属与计划；历史验证报告不反写。每次UI交付列出更新节点ID，或说明为何该修复没有改变规格。新增证据仍遵守[维护规则](../maintenance.md)，不能因文档齐全晋级Gate。

## 验证范围

文档建立本身只证明规则可定位、链接有效、覆盖已识别区域。目标实现必须提供默认/展开/异常、宽窄窗/200%、长内容及实际开合/拖动的证据；截图不能证明动画、键盘或焦点正确。本批已移除权限字段前缀、收起成果元信息并提供轻量出现效果；连续动画观感、真实中文输入法和VoiceOver仍须单独验收。正文/工具仍按可信身份分区，不声称已实现逐事件穿插。
