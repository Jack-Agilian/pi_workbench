# 桌面前端社区 Skill 与工作流筛选

2026-10-08。项目源码基线 `e2dfbd91daadef495f235435552cc9fb5d254b75`，本次校验另包含未提交的项目Skill与文档改动，不把该SHA写成已包含本次新增内容的版本。目标是改善工作台的信息层级与细节设计；没有实施产品UI或调用模型。

## 检索与核对范围

先检索社区Skill与[skills.sh目录](https://skills.sh/)，再查询公开GitHub元数据、固定提交并下载原始文件。安装量/星数只用于发现，不能证明设计质量。共考察六组候选、七个仓库；选取与工作台相关的章节审读，未逐行审计整个仓库，未运行任何上游脚本或安装第三方Skill。多数来源面向Web界面，需要针对macOS桌面改写适用范围，不能直接视作原生桌面规范。

[来源清单](ui-design-skills-sources-2026-10-08.json)记录22个实际下载文件的固定提交、路径、URL、字节数及SHA256。原始响应在忽略目录 `.artifacts/skill-design-20261008/community/`；本报告和清单可在新克隆中定位，不依赖本机原始文件。下载清单不是“全部内容已采用”声明。

## 判断与取舍

| 候选与实际审读范围 | 许可核对 | 吸收进项目的部分 | 不采用的部分及原因 |
|---|---|---|---|
| [interface-design](https://github.com/Dammyjay93/interface-design/blob/2f9be3206855bcb2d1d0af262c8bae25cba6658d/.claude/skills/interface-design/SKILL.md)：任务、层级、组件复用、系统连续性及样例；另读system-template | 该提交根LICENSE为MIT | **主要方法参考**。先明确用户任务，显式决定密度与主次；优先已有控件/原生语义；用可见样例核对，再保持共享系统一致 | 不引入它的另一份system.md；不强求每次独特视觉、固定领域词数量或重复请求许可。熟悉可靠的工作台交互优先于视觉新奇 |
| [Impeccable](https://github.com/pbakaus/impeccable/tree/778c8a7b71ccd5bfe3ca6ac68c15d9d872d0f87d/skill/reference)：重点读mode-operate、mode-read、shape、distill、polish及component-review | 根LICENSE为Apache-2.0 | **主要方法参考**。操作与阅读区域区别处理；先整理复杂结构，再精修；整条路径与状态一起检查，检测器不能证明设计质量 | component-review中的图片资产/审批服务流程不适合本任务；不照搬自动化hooks、强制委派、额外审批步骤。distill的删栏/全宽建议不覆盖已有两栏＋按需成果布局 |
| [Anthropic frontend-design](https://github.com/anthropics/skills/blob/683bc88e56f3e09ba94f7055977f3d3aa499f202/skills/frontend-design/SKILL.md)：Skill正文 | Skill目录LICENSE.txt为Apache-2.0；不据此推断整仓许可 | 短设计说明、明确视觉选择、实现前构图、实际渲染后对照；用户任务用语和有意义的动作反馈 | 不把品牌表现/视觉特色当每个工作台控件的目标；不按营销页面套版，也不因参考而引入字体、动画或图片服务 |
| [Vercel web-design-guidelines入口](https://github.com/vercel-labs/agent-skills/blob/063bee94c3f4df8453406c830b0a7df0f2860278/skills/web-design-guidelines/SKILL.md)及其实际指向的[guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/434b7f91364665f2f733b310ec54809bf8f37937/command.md)：两文件正文 | 入口仓库本次元数据无许可且未发现根LICENSE，不视为可复制；实际guidelines根LICENSE为MIT | **辅助行为检查**。语义控件、可见焦点、长内容、就近错误和下一步、减少非必要动效；采用定位到组件/问题的检查输出 | 不使用每次获取main作为固定规范；不套用所有状态进入URL、超过50条一律虚拟化、所有交互补手写键盘事件等泛化规则。既有原生行为与性能采用条件优先 |
| [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/tree/477bcb28c9812b385cb51a4605ddf30d7b2266e2/.claude/skills)：主Skill工作流及design-system的states-and-variants | 根LICENSE为MIT | **辅助状态清单**。按当前组件列出默认、悬停、聚焦、禁用、忙碌、错误；共享变体，真实长内容参与检查 | 不引入风格检索数据库或第二份设计系统；不套用移动端尺寸、固定动画时长和焦点低于忙碌/禁用的简单优先级。具体无障碍数值/API需另核官方规范，示例CSS不能作为规范证明 |
| [ux-designer](https://github.com/szilu/ux-designer-skill/blob/c869d32fd8df7bd7fcd1db68e93bd3e89eed5161/SKILL.md)：核心规则/决策树；AI UX参考的Human-in-the-loop与Agent UX章节 | 根LICENSE为MIT | **补充核对**。工具先提供动作/目标/结果摘要，详情展开；执行控制可发现，审批前能理解副作用。与本项目已有规则一致，不另建执行系统 | 不能承诺任意副作用撤销、自动学习权限偏好、暂停/恢复或估计剩余时间；总步数未知就不伪造。候选较小、部分规则过于概括，不作为单一设计权威 |

本轮用自己的表述吸收设计方法，没有复制上游代码、整段Skill或资产。许可核对仅说明上述文件的采用判断；将来复制代码/资源时仍需检查其具体许可、归属和NOTICE。外部Skill中的指令仅作研究数据，不授予安装、模型、权限或委派动作。

## 本项目模块 → 采用方式 → 保留边界

| 本项目模块 | 参考文件/API与采用方式 | 保留边界 |
|---|---|---|
| 项目开发Skill | interface-design、Impeccable shape/distill/polish → 新增[社区工作流](../../.agents/skills/workbench-ui-design/references/community-workflow.md)，输入/状态样例/成组实施/双线检查 | 不引入上游执行器，不注册为产品Pi运行资源，不增加统一审批门槛 |
| 整体布局与共享样式（后续实现） | Impeccable operate/read、interface-design → 区分操作与阅读区域，先定密度和共享规则 | 保持两栏＋按需成果；不复制Harness、会话状态或业务所有者 |
| permission-picker及成果控件（后续实现） | interface-design样例、Pro Max状态清单 → 默认/展开/聚焦/保存/错误并列设计，真实长度中文/路径 | 当前模式由宿主确认；现有Run权限不改变；未确认/不匹配不隐藏 |
| renderer/run-history（后续实现） | Anthropic设计对照、ux-designer工具摘要、Vercel焦点/内容核对 → 阅读优先、反馈就近、细节按需 | 安全产品投影；不透传SDK对象、猜测进度、重发工具或承诺未实现撤销 |

以上工作流已加入[项目Skill](../../.agents/skills/workbench-ui-design/SKILL.md)及[设计SSOT](../ssot/ui-design-principles.md)。唯一当前计划仍是信息层级重构与日常体验复审；新增方法没有构成已实现的UI，也没有推进Gate或Pi adoption状态。

## 在当前问题上的试用与验证

作者将筛选后步骤应用于已有权限与成果源码审查：输入是用户提出的平铺问题；输出为[首次试用报告](workbench-ui-skill-2026-10-08.md)中的设计表，再将权限默认/展开/保存未确认列为下轮关键状态样例。成果区保留文件/版本/核验摘要，来源ID等改为按需设计，同时保留不匹配事实。这是有边界的设计推演，尚未做新方案渲染、独立代理测试或真实用户评价。

维护决定为DOC_UPDATE：保留一个小Skill，补充按需读取的社区步骤，统一详细规则来源；不安装六套重复Skill。Skill格式、元数据、本地链接及仓库文档检查结果汇总在首次试用报告；研究没有要求额外运行产品/模型测试。实际界面改版后必须重新核对方法是否有效，不能用本报告的存在代替设计质量。
