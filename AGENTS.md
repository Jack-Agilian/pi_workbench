# Repository working agreement

本仓库已实现限定的 macOS 无模型桌面、Pi SDK/真实 Worker 接入、D1 退出与恢复闭环及限定的 D2-S 非交互 Bash 产品接入；具体基线、验证范围与未完成项以 `docs/ssot/` 和 `docs/planning/NEXT_STEPS.md` 为准。M1-A 无工具会话离线增量已限定验证；M1-B 已完成限定真实无工具文本、原会话恢复与活跃取消，30分钟单LLM总超时与5分钟网络空闲检测已获确认（API检测，不属于用量额度）；M1收口已集成develop，M2/Agent Shell已限定通过真实gpt-6-luna项目read/write/Bash、逐操作审批、活跃取消与原Session恢复；MODEL-03/04限定done、M0-Pi限定passed。Agent Shell/M2已按授权集成develop；当前唯一事项以 `docs/planning/NEXT_STEPS.md` 顶部为准；请求次数及费用缺省不限，不推算剩余额度，可选有限配置仅兼容测试/显式设置；历史请求和费用记录保留，证据见docs/validation/agent-task-live-2026-09-30.md；术语见 `docs/ssot/glossary.md`。交互 PTY、其他平台、完整真实模型桌面人工体验和生产发行尚未完成，不得将局部实现或历史报告扩大为完整产品或本轮实测。

## 修改与验证

- 先阅读 `docs/ssot/README.md`、`docs/README.md` 和 `docs/planning/NEXT_STEPS.md`。当前复用与接入决策以 `docs/ssot/` 为准。
- 新能力先查 `docs/ssot/reuse-map.json`；优先 Pi 公开导出、Operations 和经审核社区模块。默认不得重写 Agent Loop、原生 Session/Compaction、Provider/OAuth、技能解析及基础工具。公开 API 的缺陷或安全限制确需例外时，先以 ADR 记录复现、候选复用方案及拒绝原因、最小补丁范围、回归测试和退出/上游合并计划；例外不等于授权整仓 fork。
- Pi 类型允许存在于适配包内部；不得渗入 Renderer/产品持久协议。禁止未经评审 deep-import 上游内部源码。
- 同步更新文档和 `backlog.json`，运行 `python scripts/check-ssot.py`。任务/能力数量可增长，状态可推进；完成、发行版验证及 Issue 已核验声明须引用可定位证据，不把离线结构校验当作外部事实证明。
- `docs/startup/` 是原始资料快照，由原包 MANIFEST 校验。不要直接改写其中的文件或历史测试报告；新的规格/决策放到快照目录之外。确需改变快照策略，先记录来源和摘要迁移方案。
- 结构检查：`python scripts/check-docs.py --structural-only`。
- 完整示例检查：`python scripts/check-docs.py --typecheck`；需要 jsonschema 和已安装的 tsc。
- 仓库脚本测试：`python scripts/test-tools.py`。
- 新报告写入被忽略的 `.artifacts/`，不要把旧报告当作本次运行结果。
- 不从仓库、用户全局目录或任意 npm 包自动加载未经批准的 Pi 扩展。

## 功能实施前先查社区实现

- 每项新增功能或行为修订，先查本仓库 `reuse-map.json`、`reference-implementations.md` 及已有实现，再查 Pi 官方发行版的公开 API/示例和相关社区实现。不能先写完自研方案再补参考；已固定且仍适用的证据可复用，需说明本次核对结果。
- 开工时记录“本项目模块 → 参考文件/API → 借鉴或替换范围 → 保留边界”。优先直接调用公开 API，其次薄适配，再考虑经审核的社区模块/片段；决定不采用时写明具体缺口或不适用原因。
- 使用 Context7 查询相关库文档，结合官方资料、所选发行包的 exports/类型/实际 import 核实；检索结果指向 main 时不当作当前发行版依据。区分运行时导出、类型、类方法、内部实现和 experimental；社区代码固定提交并核验许可证，不能因查阅而自动安装或升级依赖。
- 保留宿主审批、进程/凭据隔离、产品协议和安全展示边界。上游直接显示原始错误不代表本产品可透传；上游没有现成 UI 也不构成重写协议或核心算法的理由。
- 采用结论写入相关 SSOT，实际验证后补 `adoption`、`evidenceRecords` 与计划。按一组完整行为集中开发和回归，合成/离线验证与真实模型验收分开，不为每个小改动反复调用付费模型。

## 项目开发 Skills

项目自有开发 Skill 放在 `.agents/skills/<name>/SKILL.md`，默认纳入 Git；下表是当前清单。工作区自有或第三方安装的 Skill 不复制进项目清单。开发 Skill 不等于产品加载的 Pi 资源，不因此授权 Worker 自动发现或执行仓库扩展。

| Skill | 适用范围 |
|---|---|
| [workbench-ui-design](.agents/skills/workbench-ui-design/SKILL.md) | 前端布局/尺寸/动效/控件行为、体验审核及设计文档维护；先读Skill和空间树的父子约束，再按授权成组实施并同步规格 |

前端不能只以功能测试通过判定设计完成；遵守 [UI规格树](docs/ssot/ui/README.md)，分别验证设计与行为。Skill 变更检查命名/元数据/本地链接和真实任务试用，使用现有文档检查及可用的 Skill 校验器；语法通过不等于设计效果通过。每次实际使用后评估是否需同步更新，不把不稳定的现场排障固化成脚本。

空间和控件的详细规格集中于 `docs/ssot/ui/`，父节点管分配、子节点管内部交互，共享尺寸与动效只维护一份。UI变更同批更新对应节点、父子链接和差距/证据；纯修复未改变规格时写明已核对。旧设计入口只做路由，历史报告及startup不改写。

## 后续代码实现边界

UI 只认识产品协议；App Server 管产品状态；Pi Worker 不直接写产品 SQLite。平台执行、进程树、审批和凭据必须走明确边界。声明权限不等于实现沙箱。

引入 Pi、Electron 等依赖前核验官方发布版本，精确固定并提交锁文件。不要把原文中的候选版本当成当前最新版本。不得伪造运行事件 fixture；Mock 和真实 Pi fixture 必须分开。

## 安全与发布

密钥始终位于仓库外；禁止打印秘密。不要强制推送、重写已有远端历史或更改账户/分支保护。发布只有在远端 SHA 被独立读回确认后才算成功。

产品默认不得混入验证额度：不设4/8次请求、累计$1、512输出token、8个操作、6条Bash或固定30秒Bash截止；有限测试值只属于显式合成测试/旧配置兼容，不能阻挡当前缺省产品使用。输出默认委托Pi/模型。
