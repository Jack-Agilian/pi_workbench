# R01–R08 修订记录与待实施验收

日期：2026-09-22。基于审核提交 `be9e1f0858e9188131c959d2438dede73c0e2215`，分支 `docs/reuse-first-ssot`。本修订保留复用优先和原始快照，不新增 Agent 引擎、工具算法、包解析器或通用 RPC 框架。

**仓库维护脚本已修改并测试；运行时项只完成契约/待办修订，没有实现或实测 Pi/App。**源码证据 U01–U04 仍是固定的 `466db0f…` 阅读结果，不是发行包或模型验证。

| 审核项 | 本次实际变更 | 对应工作与待实施用例 |
|---|---|---|
| R01 状态冻结 | schema v2；合法状态/动态数量；逐条件证据；Issue 结构；版本/完整性/锁文件记录；开发/验收依赖共用图检查；报告动态计数 | 本仓库脚本有正负向单元测试。它们只验证规则，不证明外部 Issue/测试真实性。 |
| R02 观察来源 | runtimeBindingId 在派发时捕获，覆盖 Run/Worker/Session generation；旧操作事实归原审计 | CORE-02/03：binding-late-run、binding-session-replacement、binding-late-operation、snapshot-handoff。 |
| R03 替换失败 | 区分失效前、失效后 factory、rebind 失败；旧实例不得复用，恢复用 Pi 原生引用 | CORE-02：replacement-precheck-failure、replacement-factory-failure、replacement-rebind-failure。 |
| R04 工具完整性 | 公开 create*ToolDefinition，保留准备/采样/执行模式及其他元数据；归一化/校验一次后绑定参数摘要；派生内容单独处理 | CORE-04/SEC-02：tool-definition-parity、tool-argument-normalization、approval-normalized-input、operation-derived-content、tool-context-concurrency。 |
| R05 资源切换 | 比较期望与实际加载锁，settled 边界加载确认后才能 start；快照含模板/脚本闭包，失败阻断 | SKL-01/02：resource-next-run、resource-load-failure、resource-snapshot-closure、resource-disable。 |
| R06 指定版本升级 | 明确目标版本，复用显式安装到受控新根，校验/激活分开；保留活动引用；CLI 导入对账 | PKG-01/02：package-staging、package-pinned-upgrade、package-resolution-cases、package-owner-reconcile、package-activation-rollback。 |
| R07 集成验收依赖 | 新 acceptanceDependencies 不阻止 Mock 并行；CORE-04/SEC-03/BOOT-05/CORE-01补真实SDK前置，CORE-03提前P0写入串行 | CORE-03：workspace-write-admission；CORE-05只扩展更高并发/Worktree，不再承担最低安全准入。 |
| R08 M0分层 | M0-UI、M0-SDK、M0-Pi分别留证，真实模型层依赖前两层，QA-01不能以Mock关闭 | QA-01：milestone-evidence-levels、mac-pi-e2e、windows-execution；当前全部pending。 |

完整字段规则见 [maintenance.md](maintenance.md)，技术边界见 [integration-contracts.md](integration-contracts.md)，架构取舍见 [reuse-first.md](reuse-first.md)，具名条件见 [backlog.json](../planning/backlog.json)。用例名称是计划标识，不声称仓库已存在这些应用测试文件。

## 验证范围

本修订的检查覆盖：当前 SSOT 结构；状态正反例；带证据推进/无证据伪完成；新增任务与能力；空验收；未知引用；两类依赖联合环；发行记录；M0证据分级；原始快照摘要及已有文档辅助测试。具体测试数、命令和被测文件树写入本次交付记录，不让文档硬编码计数成为新的阻碍。

没有安装新的 Python/npm 依赖，没有运行 Pi、Electron、真实模型、Office 生成、macOS/Windows 实机、沙箱或签名发布。Node/Pi兼容性、运行接缝和平台E2E依旧由计划 Gate 决定。原有文档例子及其TypeScript检查仍是历史规格检查。

## 后续实施范围

A0/A1 发行/Session探针可以开始；在对应接缝实际使用之前实现 R02–R05 的验收用例；R06 在 A3/PKG 阶段验证。未知可执行扩展继续不开放，源版本和许可未确认的社区组件不直接复制。不得因“文档已修订”把应用Backlog标成done。
