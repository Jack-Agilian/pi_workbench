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

## A0/A1 后续实施证据（2026-09-22）

以上修订阶段的“未运行 SDK”是历史范围。后续在代码提交 `7fad5e9d3af4ef70d72f71c58782f577e4aa0aca` 使用真实 Pi 0.87.0 完成 Session 替换绑定及 R03 三种故障的零模型探针，见 [A0/A1 报告](../validation/a0-a1-2026-09-22.md)。R02 仅覆盖 Session 身份，跨 Run、迟到操作审计和快照交接仍待实施；R04–R06 与完整 Gate 均未验证。严格应用声明检查被上游缺口阻塞，不能把本轮通过项推导为 CORE-02/M0-SDK 完成。

## A2 后续实施证据（2026-09-22）

上述首次声明阻塞已由 [A0/A1 收尾](../validation/a0-a1-closeout-2026-09-22.md) 记录的固定类型补丁解决。A2 代码提交 `23ba1bdc54188ee3dbbd0a744800ffea84f855ec` 在真实 Pi 0.87.0 上验证 R04 的完整工具定义、参数归一化、结果/diff/裁剪、批准摘要、派生内容及并发操作接缝，并验证受控本机 Bash 的活跃取消/超时，见 [A2 报告](../validation/a2-2026-09-22.md)。R02 额外覆盖探针的原操作身份与迟到副作用记录，仍非产品 Run 审计实现。R05/R06、完整平台/产品权限和三个 M0 Gate 均未完成。

## A3 后续实施证据（2026-09-22）

代码提交 `c2378dd0a9c2f54daa50bc4cf843e044d3c484b2` 验证 R05 的完整内容副本、实际 Session reload/加载锁、下一次准入和失败阻断；host settled/保存回调是合成输入，不是产品 Run/DB。R06 验证指定 npm 双根安装、pinned update、Git ref、共享依赖/缺包和失败保留旧根，见 [A3 报告](../validation/a3-2026-09-22.md)。外部 CLI 对账、持久激活事务、签名/撤销与 GC 仍未实现，不能把 R05/R06 或相关工作项整体标为完成。
