# SSOT 状态、证据与验收维护

版本：schemaVersion 2，2026-09-22。适用于 `reuse-map.json` 和 `../planning/backlog.json`；不是 Pi API、应用数据库或新的项目管理服务。它替代“所有内容永远处于 proposed、数量固定”的一次性断言。原 `docs/startup/` 文件及其摘要不迁移。

## 1. 什么可以改变

任务和能力允许新增，ID 唯一且有完整验收条件即可；原 28 项 ID 用作历史锚点，但数量不是规范。保留/拆分/删除已有 ID 时写明迁移理由并更新引用。Issue 可以登记，不能通过离线脚本证明其真实存在。

| 字段 | 合法推进及约束 |
|---|---|
| 任务 `state` | proposed → in_progress / blocked → done；可 cancelled。blocked/cancelled 需 statusReason。 |
| 任务 `implementationStatus` | proposed 为 not_implemented；in_progress/blocked 可尚未编码或 in_progress；done 必须 implemented。 |
| 能力 `implementationState` | not_implemented、in_progress、implemented、deferred。implemented 需 adoption 的 scoped verification。 |
| 总体 `implementationStatus` | documentation_only、in_progress、implemented。开始能力实现后同步总体状态；不因修改文档就标为 implemented。 |
| `githubIssueNumber / githubIssueUrl` | 数字必须为正整数且 URL 对应本仓库；未核验时 issueVerificationStatus=not_checked。 |
| `issueVerificationStatus=verified` | 必须有 issueEvidence 指向记录了匹配 Issue 地址的 issue 类证据；脚本只校验声明的结构。 |

`dependencies` 是开发前置，`acceptanceDependencies` 是额外的集成验收前置。Mock/接口允许提前并行，不等于能够验收。两类边合并后必须无环；done 要求关联前置均 done，不能借 cancelled 跳过。两类依赖使用一个共享检查函数，避免维护两套图算法。

## 2. 逐条验收而非一个完成布尔值

每个任务仍保留人读的 `workAndAcceptance`，不得为空；具体条件在 `acceptanceCriteria`，每条具有唯一 id、requirement、非空 plannedChecks 和 evidenceRefs。`plannedChecks` 是待实现的测试标识，不是已有测试文件或通过记录。

done 必须逐条附 passed 证据，并满足任务 requiredEvidenceKinds；额外的 milestoneDependencies 必须 passed。引用存在不等于结果可信，需要评审证据的实际范围。任务的来源/依赖文字 sourceDependencyText 只作历史说明，不参与当前图计算。

## 3. 统一证据记录

可复用的记录放入 `reuse-map.json.evidenceRecords`，任务、能力和里程碑仅引用 ID。A0/A1 已登记限定范围的发行/零模型 SDK 证据，保留首次失败声明检查，并新增 [收尾通过记录](../validation/a0-a1-closeout-2026-09-22.md)；不覆盖旧失败、不填伪造占位值。字段如下：

| 字段 | 要求 |
|---|---|
| id | 唯一 EV- 前缀 ID |
| kind | review、static、mock、sdk、model、platform、release、issue |
| result | passed / failed；failed 可记录，但不能支持完成声明 |
| scope | 实际验证内容与未覆盖范围；不能省略 |
| commit | 被测代码的完整提交 SHA；有本地差异时在报告内同时记录差异摘要 |
| recordedAt | 带时区的 ISO-8601 时间 |
| platforms | darwin、win32、linux 或 not_applicable；不据入口脚本存在推断实机覆盖 |
| locator | 仓库内实际存在的结果摘要，或不含凭据的 HTTPS 结果地址 |

`.artifacts/` 是即时输出，不作为跨克隆可定位的持久证据。需要引用时，将脱敏结果摘要提交到合适文档路径，或使用可访问的 CI 地址。禁止 repo 外路径、软链接、忽略的环境目录。对于 HTTPS，离线脚本**不访问、不判断权限、不核验内容或不可变性**；评审者核对被测 commit、测试内容、平台和结果，尽量用固定 CI run/提交地址。

P/C/L/U 是上游资料的阅读索引，不是测试结果，不能用于 evidenceRefs。测试脚本里的 EV 合成输入只用于验证规则，从不写进正式 evidenceRecords，不能作为产品能力证明。

## 4. 发行包与公开入口

`upstream.npmVersionPinned` 可先选择一个精确版而保持 releaseTarballVerified=false。设为 true 时，releaseArtifact 必须提供 package、同一 version、tarballUrl、SRI integrity（sha256/384/512）、实际测试 nodeVersion、存在的 lockfilePath 与 release 类 evidenceRefs。脚本只检查格式/引用/文件存在，不重新下载 tarball、验证 registry 签名或读取 lockfile 的完整依赖语义。

能力的 `adoption.imports` 记录 package、公开 importFrom、exports 的 name 和 runtime/type 区别、selectedVersion。它先是“欲使用的公开入口”清单，不代表 npm 导出已验证。source_reviewed 只表示源码/文档级证据；selected 需明确包版本或 selectedSourceCommit；release_verified 需版本与发行证据；verified 需所选输入和可定位接缝验证，且 scope 必须明确。own 能力用 not_applicable，不编造上游版本。

实验或社区候选暂不填不存在的发行信息；首次采用必须补入口、提交、许可及测试。方法名（如 AgentSession.steer）不冒充根级导出。版本正则只拒绝范围/标签，不是另一个 npm semver 解析器，真实解析依旧复用上游工具。

## 5. M0 三层证据

`backlog.json.milestones` 分别记录 M0-UI、M0-SDK、M0-Pi，可增加后续里程碑，不允许静默降低现有证据门槛：

- M0-UI：Mock + Mac 主闭环证据，不声称真实 Pi。
- M0-SDK：release + sdk，允许零模型调用，但必须使用真实发行包。
- M0-Pi：前两层通过后，model + platform，包含 Mac；账户/费用/平台未授权则 pending 或 blocked。

同一份报告可覆盖多条件，记录仍需明确各自验证范围；不能用不相关的 Mac 日志补齐 Linux 模型运行的 Mac E2E 声明。此类语义由评审核实，离线脚本的集合检查不构成端到端保证。三个 Gate 是一套 UI/Adapter 的不同证据级别，不是三套 Runtime。

## 6. 运行检查

```bash
python scripts/check-ssot.py
python scripts/check-docs.py --structural-only
python scripts/test-tools.py
```

第一条检查实际清单，同时运行独立的合成变异测试；测试不依赖当前能力/任务恰好是多少项，结果里的计数从文件动态计算。原始快照摘要检查仍保留 27 个文件的严格约束。

A2 的 [工具与 macOS Shell 记录](../validation/a2-2026-09-22.md) 同样只支持其明确范围；Operations、固定测试命令和部分路径负向测试不能推导出完整平台沙箱或产品审批系统。

A3 的 [资源/包记录](../validation/a3-2026-09-22.md) 区分应用锁与仅安装测试输入；合成 Git/准入故障、实际 npm/Git 子进程和公开缺口复现分别说明。探针通过不把 PKG-02、签名/撤销、产品激活或 M0 Gate 晋级；网络准备与禁网 SDK 执行分开记录。

A4 的 [凭据/模型记录](../validation/a4-2026-09-22.md) 区分实际 SDK 编排与合成 Provider 回调；内存 store、状态投影和测试输出/环境 canary 不等于系统 Keychain、真实 OAuth、产品日志或退出 flush。SEC-03 只推进 in_progress，所有证据引用真实被测代码 SHA，M0 Gate 不晋级。

B 的 [最小核心记录](../validation/b-2026-09-22.md) 将真实 SQLite/文件系统与合成宿主/崩溃输入明确区分；5 项 Pi 接入包含 1 项合成未来事件投影。own 能力仍用 adoption.status=not_applicable、无上游 imports，verificationStatus=verified 仅表示引用范围已经验证，implementationState 保持 in_progress。BOOT-01/CORE-01/CORE-03/ART-01 推进为 in_progress；没有完成整个 B、真实 Worker/IPC 或 M0 Gate。代码提交先于证据提交，新增记录均引用实际被测 SHA。

B-IPC 的 [持久报告](../validation/b-ipc-2026-09-23.md) 按 SDK、实际 macOS 进程/SQLite、协议合成输入和静态回归分别登记证据。每项引用已存在的被测代码 SHA，后续文档提交不冒充被测代码；own 能力不伪造上游 imports。实际进程清理也只支持所测固定后代，不推导通用沙箱或 M0 Gate 完成。
