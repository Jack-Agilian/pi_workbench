# 工作台空间与控件规格树

2026-10-08建立。这里是**界面空间、尺寸、布局与交互呈现的详细权威**；[通用原则](principles.md)管原则，业务契约管权限/身份/副作用，[当前计划](../../planning/NEXT_STEPS.md)管顺序，Skill管维护方法。详细空间规则不再分散新增到历史契约中。冲突时先报告并同步修订，不用视觉规格覆盖业务边界。

本树 v1 是本项目的目标规格，**待成组实施和渲染复审**。各节点的“现状/差距”基于 `c128dab39884a34d81bf8f32c5d022adb9b9a0d4` 源码审读；不是本轮实机尺寸/动画测量。具体数值是设计起点，有理由可修订，变更需同批更新唯一持有节点。

**2026-10-08逐控件复审：v1需要产品设计纠偏，不能直接照单实施。** [三位gpt-6-sol与主代理的全量审核](../../validation/ui-control-audit-2026-10-08.md)覆盖70项，发现成果列表主导预览、正文/操作固定分区、目录对象混淆及隐藏失败反馈等问题。下一步先形成完整工作路径的状态原型，再修订对应父子节点；右侧围绕当前文档阅读，保留Chat可信入口。现有尺寸/时长是待验证候选，协议不足的降级呈现不是永久产品目标。审核建议不自动成为第二套规格；业务权限/身份/恢复不变量与用户已明确的权限值＋提示交互继续生效。本次仅更新根的审核状态，叶节点暂保留v1便于对照，未声称产品已经修复。

## 阅读树

- [通用设计原则](principles.md)与[旧文档收口清单](migration.md)。

- [共享尺寸与视觉参数](foundations.md)：数值、单位、空间预算。
- [共享动效与层级](motion.md)：开合、拖动、减少动态效果、焦点时序。
- [SHELL 工作台窗口](shell/README.md)
  - [NAV 导航侧栏](shell/navigation.md)：品牌/关闭、目录、新建、查找、会话行/改名、连接状态。
  - [WORK 主工作区](shell/workspace/README.md)
    - [HEAD 会话顶部](shell/workspace/header.md)：导航开关、标题/目录、审批/停止、成果入口、上下文。
    - [FEEDBACK 配置与反馈](shell/workspace/feedback.md)：模型配置、连接、跨会话运行、恢复与终态。
    - [CHAT 会话区](shell/workspace/conversation/README.md)
      - [MESSAGES 阅读记录](shell/workspace/conversation/messages.md)：空态、分页、正文、代码、复制、返回最新。
      - [TOOLS 工具与审批](shell/workspace/conversation/tools.md)：摘要、输出、目标/风险、决策与结果。
      - [COMPOSER 输入区](shell/workspace/conversation/composer/README.md)：草稿、工具栏、发送、提示、演示入口。
        - [PERMISSION 权限选择器](shell/workspace/conversation/composer/permissions.md)：当前值、气泡、选择面板、保存反馈。
    - [ARTIFACTS 成果栏](shell/workspace/artifacts/README.md)：标题/关闭、版本列表、分页、说明。
      - [PREVIEW 成果预览](shell/workspace/artifacts/preview.md)：版本、核验、内容、复制、来源。

这是一棵**产品空间树**，不要求一比一复制React组件树。简单子控件放父文档的子节点表；有独立布局/多状态/复用职责时才拆文件。共用气泡、分隔条和反馈规则引用共享节点，不复制成多份。新增实际区域必须在父节点和此索引登记，不能只新增一个孤立文档。

## 节点填写与维护

每个空间节点都有稳定ID、父节点、职责/非职责、子区域表（位置/尺寸/展示与动作）、状态/溢出/键盘要求、代码归属、现状/差距和验收。数值引用共享参数；不适用项写清原因，不机械创建空章节。模板与变更步骤见[Skill维护流程](../../../.agents/skills/workbench-ui-design/references/space-spec-maintenance.md)。

变更前读根、共享规则、全部祖先和目标节点，再查被影响的兄弟与子节点。变更布局约束时先改持有它的父节点；文案/局部状态改对应叶节点。移动/删除区域时同步父子链接、此索引、源码归属与计划；历史验证报告不反写。每次UI交付列出更新节点ID，或说明为何该修复没有改变规格。新增证据仍遵守[维护规则](../maintenance.md)，不能因文档齐全晋级Gate。

## 验证范围

文档建立本身只证明规则可定位、链接有效、覆盖已识别区域。目标实现必须提供默认/展开/异常、宽窄窗/200%、长内容及实际开合/拖动的证据；截图不能证明动画、键盘或焦点正确。当前已知差距包含无专用侧栏开合动画、权限字段前缀、成果元信息平铺；这些仍是待实施项。
