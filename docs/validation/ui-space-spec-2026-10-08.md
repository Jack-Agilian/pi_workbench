# UI空间规格树与分散文档收口

2026-10-08。源码审读基线 `c128dab39884a34d81bf8f32c5d022adb9b9a0d4`，分支 `codex/ui-correctness`。本轮检查另含尚未提交的规格树、Skill及文档迁移差异；不将基线SHA宣称为已包含新树的版本。产品代码、依赖、数据库、startup与历史测试报告均未修改，零真实模型。

## 新能力与参考

建立[UI规格树](../ssot/ui/README.md)：17份文档包含12个空间节点，以及根索引、通用原则、共享尺寸、共享动效、迁移清单。每个空间按父子关系说明职责、位置/尺寸、子控件、状态/滚动/焦点、代码归属、现状差距和验收。目标包括统一阅读/输入轴线、目录筛选按需、紧凑权限入口、成果信息分层；没有将这些目标标为已实现。

本轮复用[前次固定社区研究](ui-design-skills-research-2026-10-08.md)：interface-design的系统一致性和任务层级、Impeccable的操作/阅读及可中断动效、现有pi-gui分隔条采用。它们适用于设计与维护方法，不提供本项目的具体尺寸或180ms默认值。尺寸与时间是本项目v1目标，待真实渲染校准；没有新增库API实现、社区安装或新的Pi adoption/evidenceRecords通过声明。

源码核对renderer、pane-layout、style、main、thread-directory/navigation、approval-list、artifact-panel及其他执行提示：现有栏宽/拖动/覆盖机制可复用；hidden直接显隐没有满足新动效规范。JS与CSS的700边界不同、输入/正文轴线不同及常驻过滤/技术字段纳入节点差距，未顺带修代码。

## 迁移结果

[迁移清单](../ssot/ui/migration.md)逐项记录旧位置→新权威→保留边界。旧ui-design-principles缩成入口；ui-experience移除累积布局段落，只保留业务不变量、采用和历史证据入口。权限入口呈现归PERMISSION；读取/复制、目录/命名、早期C契约明确路由，业务语义保留。AGENTS、维护规则、Skill及NEXT_STEPS同步；历史报告和startup未被“更新”成新结果。

唯一当前事项仍是信息层级重构与日常体验复审；UI-01-A08补父子规格同步和动效验收的计划项，evidenceRefs仍为空。UI-01/02、ART-01与Gate均不晋级。

## 实际试用维护流程

| 输入变化 | 查阅与更新路径 | 输出与发现 |
|---|---|---|
| 侧栏收放需精心设计 | 根→FOUNDATIONS/MOTION→SHELL→NAV→兄弟WORK/CHAT | 统一宽度预算、快速反向/断点/拖动/减少动态效果、焦点与阅读锚点；当前缺动效必须保留为差距 |
| 权限入口需紧凑且范围清楚 | 根→WORK/CHAT→COMPOSER→PERMISSION，再核权限业务契约 | 触发值/气泡/多行选项/保存反馈分层；选择未来模式不能改变当前Run |
| 用户要求分散文档集中收口 | 旧设计页与业务契约→迁移表→新树→Skill | 只增加树会留下平行权威，因此实际迁移正文并更新旧入口；安全/协议和历史证据不删除 |

这是作者基于源码的工作流试用，没有独立代理或新UI实机体验。维护决定DOC_UPDATE：原Skill补树导航、父子影响、同批同步、模板和迁移检查，保持单一职责。使用现有检查；未为仍依赖设计判断的节点覆盖新建通用编辑器/检查框架。

## 验证范围

文档检查不验证具体像素/动效舒适度，不等于实际屏幕阅读器或用户评价。实现阶段需在宽/窄/200%和异常状态下验证空间预算，动态开合需连续观察，不能以静态截图或固定等待时间替代。原始本轮输出统一放 `.artifacts/ui-space-spec-20261008/`；可复查的摘要保留在本报告。

实际执行：

- 使用前批忽略目录中的PyYAML运行skill-creator的`quick_validate.py .agents/skills/workbench-ui-design`，通过；另核UI元数据和Skill默认提示，未新增安装。
- `.venv/bin/python scripts/check-ssot.py`：60通过；`.venv/bin/python scripts/test-tools.py`：15通过。
- `.venv/bin/python scripts/check-docs.py --structural-only --report .artifacts/ui-space-spec-20261008/docs.json`：5通过、0失败、2跳过；startup的27份原始文件摘要保持一致。
- 本轮只读树检查：17份文档、12个空间ID唯一，所有空间父子链接双向可达、均有现状与验收；逐一检查树和Skill相对链接，UI元数据通过。只确认结构，不宣称控件视觉设计已通过。
- 暂存差异仅文档/项目Skill；有限私钥与常见令牌格式扫描通过，非完整秘密扫描。首次`git diff --cached --check`发现迁移文件末尾多一个空行，已修正后复查；没有以该检查替代UI运行测试。本轮未运行产品类型、Electron、模型或动画测试。
