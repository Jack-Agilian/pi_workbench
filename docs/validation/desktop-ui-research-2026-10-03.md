# Agent 桌面前端布局研究

研究日期：2026-10-03。用途：当前 Pi Workbench UI 审核的外部参照，不是功能采纳决定或竞品排名。配套当前实现审核见 [UI 审核](ui-layout-review-2026-10-03.md)。研究先完成，再交给一个普通 subagent 独立审核及交叉质疑。

## 样本与证据限制

指定样本为 Codex App、腾讯 WorkBuddy、Claude Code 桌面版；补充 OpenCode Desktop、Conductor、Cursor Agents Window。补充样本覆盖开源会话工作台、多任务开发工作台和 IDE 衍生 Agent 界面。OpenCode 官方更新日志有 2026-09-30 发布，Cursor 有 2026-04-02 新界面发布依据；其余凭官方持续维护资料和任务相关性入选。没有独立统计近期用户增速，不能称为“热度前三”。不把网站导航、CLI/TUI 或 Claude 普通聊天界面当作桌面 Code 布局。

证据等级：D=官方文档明确描述；V=本轮实际看到的官方界面图片；J=本报告设计判断。没有安装或登录六个产品进行全流程试用，没有测量其精确尺寸、性能、键盘可达性或安全实现。官网和文档可能跨版本；任何借鉴都须在本项目验证。

特别说明：旧 Codex app 文档入口本次重定向到 ChatGPT Learn，当前页面称 ChatGPT desktop app，同时仍含 Codex 界面示例。以下 O 系列只代表本次可读官方页面，不冒充某一历史 Codex 二进制版本。该站 Projects 页面还有重复章节和快捷键表述差异，因此本报告不采纳精确快捷键作为规范。

## 六种界面的组织方式

| 产品 | 整体组织与细节（证据） | 值得借鉴（J） | 不直接照搬（J） |
|---|---|---|---|
| Codex / 当前 OpenAI 桌面资料 | 项目和会话导航、置顶/最近、搜索与归档；文件预览在聊天旁；审阅把 Summary 与 Changes 分开，支持文件逐项标记已看（O1–O4，D） | 左栏负责找回工作；主区负责对话；旁栏承载当前成果或审阅对象；低频设置不必占据聊天首屏 | 插件生态、云同步、多工作目录、PR 管理都不是当前 M0 的必备范围 |
| 腾讯 WorkBuddy | 新任务输入附近选择工作模式、模型和工作目录；任务留在左侧；右侧可展开，分产物/全部文件/变更/预览标签（W1–W2，D/V） | 输入区集中“这次要在哪里、以什么能力做”；右侧把找文件、看成果、看改动区分清楚 | 不照搬完全访问权限、自动加载技能或任意网页执行；示例右栏很宽，小窗口是否好用未经测试 |
| Claude Code 桌面版 | 会话侧栏支持状态/项目/环境筛选；可以并排会话，终端、编辑器、差异和预览构成可调整面板；执行记录有 Verbose/Normal/Summary 密度（A1–A2，D） | 高频关注结论与当前执行，详细工具记录逐层展开；筛选优先于无边界增长的最近列表 | 任意拖放网格、多 Agent 并行和自动合并不属于本产品当前能力；不为相似外观扩建 IDE |
| OpenCode Desktop | 官方下载页强调标签组织会话；近期更新涉及会话重命名、归档即时反馈、搜索加载时保留结果、时间线按实际顺序组织（P1–P2，D） | 状态变化不让列表闪空；会话和消息顺序稳定；重命名/归档是长期使用的基础，不只是美化 | 未在本轮完成桌面三栏图的视觉核对，不断言其具体栏宽或默认面板；不替换 Pi Harness |
| Conductor | 每项任务关联 workspace、分支、终端、diff 和审阅；diff 文件列表、统一差异、按提交筛选、行级评论及后续 PR 动作（C1–C2，D） | 成果要能被定位和检查，不能只留聊天里一句“已完成”；审阅对象与执行说明分开 | 每任务 worktree、PR 生命周期和并行 Agent 是特定开发产品选择，不是通用文件工作台必须复制的范围 |
| Cursor Agents Window | Agent 窗口独立于经典编辑器，组织跨项目/环境任务；在窗口内找文件、审阅改动和管理 PR，也可回 IDE（U1–U2，D） | 根据用户此刻“提任务/看执行/验成果”的目标组织入口，渐进展开开发细节 | 不把 Agent 工作台做成一个缩小但残缺的 IDE；官方图片本轮加载受阻，未据此判断颜色和像素布局 |

## 视觉观察：WorkBuddy 官方示例

本轮浏览器打开 W2 的官方原图。图中左侧为搜索、新任务和其他功能导航；中央为任务标题、执行摘要、正文、成果快捷入口与底部输入；右侧为标签和文件/内容区域。工具记录可见折叠控制，正文用列表和小标题表达层次。图片带蓝色教学标注，不能把标注当真实选中态。截图标示版本 v4.7.0，文档导航更新时间为 2026-09-14，二者不能推断为最新安装版。

[官方三栏示例原图](https://download.codebuddy.ai/web/docs/0c7c3272facedbcbcfc0375d0a2cf1155b0c9d60/docs/static/image-40.CJhADQPn.png)。只链接原图，不把竞品截图复制为项目资产。

## 转为本项目的审核问题

以下是跨样本得到的设计判断，不声称六个产品都实现相同行为。

1. **主要空间给当前工作。** 三栏可以保留，但无审批、无成果时旁栏是否仍值得常驻？标题、目录、连接、模式和说明能否合为紧凑上下文区？
2. **先结论，后细节。** 正文、工具摘要、完整输出需要三层密度；完整 stdout 不应天然与最终回答竞争。失败/待审批必须显眼，不能被“精简”隐藏。
3. **审批是待处理动作，成果是可回看的对象。** 两者可共用侧区，但要有清楚分区和导航；持续存在的成果不能把新审批推到不可见处。
4. **阅读顺序必须可信。** 模型解释、工具动作、结果、最终回答应保持真实关联；UI 不可为了排版编造执行顺序。
5. **文件按用户对象组织。** 同一路径多版本应可理解；打开某成果时必须知道是当前文件、历史登记还是经过核验的预览。
6. **输入附近交代有效上下文。** 当前目录/模型/工具状态应能快速确认；不要反复展示实现名词、额度或大段安全声明。必要风险说明跟具体审批走。
7. **长期使用要能找回来。** 多项目、同名会话、长标题、历史分页和失败会话需要可辨识的信息；搜索/归档优先于无依据的复杂虚拟化。
8. **小窗口不是大窗口等比缩小。** 保持阅读区域和审批按钮可达，拥挤时切换层级/面板；不能靠把重要文字压至 9–10px 解决。
9. **可访问性要单独检查。** 对比度、键盘焦点、动态状态和语义标签不能仅靠“看起来像竞品”证明。

推荐方向的结构草图（J，不是已实施设计）：

```text
会话导航（可收起） | 当前会话 / 目录 / 连接 / 展开详情
搜索、最近、状态   | 正文与执行摘要            | 按需侧区
                  | 按真实关联组织工具        | 审批 / 成果
                  |                         | 文件版本 / 预览
                  | 输入 + 有效能力 + 发送/停止
```

先保留本项目的单写宿主、审批绑定、真实清理、产品 DTO 和 Pi 原生历史。以上只建议整理展示与导航，不能将 UI 组件、主题或者竞品交互当作执行权限。当前主要社区代码参考仍是 [pi-gui 映射](../ssot/reference-implementations.md)，本轮新增六产品只作布局研究；没有新增依赖、移植代码或改换技术路线。

## 来源索引（本轮读取）

| ID | 官方资料 | 用途与读取方式 |
|---|---|---|
| O1 | [Features](https://learn.chatgpt.com/docs/features) | 旧 Codex features 的重定向目标；网页正文与示例结构 |
| O2 | [Projects and chats](https://learn.chatgpt.com/docs/projects) | 项目/会话组织；网页全文相关章节 |
| O3 | [Code review](https://learn.chatgpt.com/docs/code-review) | 审阅信息分层；网页正文 |
| O4 | [Work with files](https://learn.chatgpt.com/docs/artifacts-viewer) | 对话旁预览；网页正文 |
| W1 | [新建任务栏](https://www.workbuddy.ai/docs/zh/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Task-Bar) | Web 抓取超时后，以公开 HTML 和浏览器读取正文，未登录 |
| W2 | [右侧边栏](https://www.workbuddy.ai/docs/zh/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Right-Sidebar) | 浏览器读取正文与官方图片；明确四个标签和展开入口 |
| A1 | [Claude Code Desktop](https://code.claude.com/docs/en/desktop) | 会话、权限入口、显示密度；官方文档 |
| A2 | [Desktop redesign](https://claude.com/blog/claude-code-desktop-redesign) | 2026-04-14 布局更新；官方发布文章 |
| A3 | [Preview, review and merge](https://claude.com/blog/preview-review-and-merge-with-claude-code) | 2026-02-20 预览与审阅；正文读取，图片未成功加载 |
| P1 | [OpenCode Download](https://opencode.ai/download) | 桌面入口；官网当前展示与搜索版本文案可能不同，不据此锁版本 |
| P2 | [OpenCode Changelog](https://opencode.ai/changelog) | 2026-08 至 09 的桌面交互修订；本轮页面含 v1.18.34，未安装 |
| C1 | [Conductor Introduction](https://www.conductor.build/docs) | workspace 工作流；官方正文 |
| C2 | [Conductor Diff viewer](https://www.conductor.build/docs/reference/diff-viewer) | 文件/差异/评论组织；官方正文，未实际播放演示 |
| U1 | [Cursor Agents Window](https://cursor.com/docs/agent/agents-window) | 新窗口职责与编辑器边界；官方正文 |
| U2 | [Cursor 3 发布讨论](https://forum.cursor.com/t/cursor-3-agents-window/156509) | 官方团队发布内容，不将论坛个人反馈当事实；2026-04-02 |

## 补充：是否复刻已有开源前端

用户在研究中追问后，补查了 pi-gui 固定提交 `163054227d370a49d09099c61eb65798481294ac` 的 README、根 LICENSE，以及浏览器可见的 `threads.webp`、`review-light.webp` 官方图片。根许可为 MIT，版权主体 Matthew Lam；这不替代具体移植文件及其依赖的逐项许可核验。[固定 README](https://github.com/minghinmatthewlam/pi-gui/blob/163054227d370a49d09099c61eb65798481294ac/README.md) · [固定 LICENSE](https://github.com/minghinmatthewlam/pi-gui/blob/163054227d370a49d09099c61eb65798481294ac/LICENSE)。

会话图可见：标题条紧凑，侧栏项目/时间/活动说明帮助区分会话；正文内工具用摘要行表达，详情有展开箭头，最终回答在操作记录后。审阅图明确显示文件名和差异层级。它比本项目现有大工具卡和重复标题更适合密集阅读，但图片不证明其审批/恢复语义适用于本项目。[固定会话图](https://raw.githubusercontent.com/minghinmatthewlam/pi-gui/163054227d370a49d09099c61eb65798481294ac/apps/website/public/media/threads.webp) · [固定审阅图](https://raw.githubusercontent.com/minghinmatthewlam/pi-gui/163054227d370a49d09099c61eb65798481294ac/apps/website/public/media/review-light.webp)。

**建议：复用成熟布局范式，并选择单一主代码参考；不把整套前端移植当默认方案。** 以 pi-gui 为主参考，与现有 SSOT 一致；OpenCode 只用于会话稳定性与交互对照，尚不具备本轮完整视觉/源码移植评估。不把闭源 Codex/Claude/WorkBuddy 叫作可复制的开源组件库。

| 本项目模块 | 参考文件/界面 | 借鉴或替换范围 | 保留边界 |
|---|---|---|---|
| renderer/style 的导航和外壳 | pi-gui 固定 `threads.webp`、README 工作台说明 | 紧凑上下文、会话辅助信息、主对话+按需旁栏；先做本项目状态草图再定尺寸 | 不直接搬它的执行/认证/全局 Pi 目录约定；不复制品牌或未具备入口 |
| run-history 的正文和工具摘要 | 已指定 `conversation-timeline.tsx`、固定会话图 | 阅读密度、工具展开身份、结论突出；具体纯展示组件经准入后优先复用 | 先修产品顺序/关联投影；不能按 UI 需要伪造事件或透传 SDK |
| timeline-scroll | 已指定 `use-timeline-viewport.ts` / `timeline-layout.ts` | 参考阅读位置与跟随行为，只替换明确重叠职责 | 单一滚动位置写入者；不叠加完整第二套 driver/虚拟化 |
| approval-list / artifact-panel | WorkBuddy W2 分区及 pi-gui 审阅信息层次 | 审批可发现、成果对象/版本清楚、预览就近；适配自己的组件 | 宿主核验、一次授权、旧版本拒绝错配继续生效；不开放任意文件执行 |

仅布局复用不保证减少代码维护，整套代码移植也不保证最省工。下一实施选择一个完整状态组（空状态→执行→审批→成果/失败），先确认具体画面、组件依赖、删除旧职责及回归范围，避免六家样式拼盘。此次没有采用新组件或改变既有 Query/Pi 技术路线。

研究边界：未核验竞品闭源实现、全部许可证移植准入、真实权限安全、中文输入法、屏幕阅读器和全套错误态。热度和营销描述不作为本产品验收条件。Skill 评估：本轮是依赖现场证据和设计判断的探索性研究，复用现有 OpenAI Docs 技能，不新建总括性 UI 审核 Skill。
