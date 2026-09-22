# 上游证据与核验边界

下文源码阅读是历史记录；当前发行选择与实际验证见文末 A0/A1。

源码核验日期：2026-09-21。项目基线：`43e50c80a7938ea60fcf49813cc0809e872d31fa`。

## Pi 源码快照

仓库：`earendil-works/pi`。本次读到的 main 提交：`466db0fecdc20996a553116984d18c0d362b035a`。该提交 package.json 标注 `@earendil-works/pi-coding-agent` **0.86.1**、Node **>=22.19.0**。[P15]

**这是源码快照版本，不是已验证的最新 npm 发行版，更不是应用 lockfile。**本次没有下载 npm tarball，没有执行 npm install，没有真实 Pi 模型调用。当前容器 Node 为 22.16.0，低于该源码标注要求；不把此环境的文档测试描述为兼容性测试。

公开导出的依据来自根 `src/index.ts` 和 package `exports`；源码在 `src/core` 中存在本身不足以允许 deep import。`./client` / `./experimental/plugin` 的 source 条件入口不作为首版发行包集成承诺。

| ID | 资料 | 核验范围 |
|---|---|---|
| P01 | [Pi 公共导出](https://github.com/earendil-works/pi/blob/466db0fecdc20996a553116984d18c0d362b035a/packages/coding-agent/src/index.ts) | 完整入口；确认工厂、Session、ModelRuntime、PackageManager、Skill 与 Operations 导出。 |
| P02 | [Pi SDK](https://github.com/earendil-works/pi/blob/466db0fecdc20996a553116984d18c0d362b035a/packages/coding-agent/src/core/sdk.ts) | 读取 1–240 行；另核对官方 SDK 文档。创建 Session、名字工具列表、服务注入与默认资源加载。 |
| P03 | [Pi PackageManager](https://github.com/earendil-works/pi/blob/466db0fecdc20996a553116984d18c0d362b035a/packages/coding-agent/src/core/package-manager.ts) | 读取 1–210 行；确认 resolve/install/update/listConfiguredPackages/progress 公共接口。未完整审计所有安装分支。 |
| P04 | [Pi Skills 文档](https://github.com/earendil-works/pi/blob/466db0fecdc20996a553116984d18c0d362b035a/packages/coding-agent/docs/skills.md) | 行为解释以官方网页读取为准；符号由 P01 验证，源码固定链接作为复查入口。 |
| P05 | [Pi Extensions 文档](https://github.com/earendil-works/pi/blob/466db0fecdc20996a553116984d18c0d362b035a/packages/coding-agent/docs/extensions.md) | 官方网页读取：同名覆盖、Operations、prompt metadata、extension UI 与执行权限。 |
| P06 | [Pi Packages 文档](https://github.com/earendil-works/pi/blob/466db0fecdc20996a553116984d18c0d362b035a/packages/coding-agent/docs/packages.md) | 官方网页读取：Pi 包资源与安装/配置概念；不等于产品审核/权限/事务保证。 |
| P07 | [工具 Operations 示例](https://github.com/earendil-works/pi/blob/466db0fecdc20996a553116984d18c0d362b035a/packages/coding-agent/examples/extensions/ssh.ts) | 网页源码读取；用于说明包装与 Operations seam，不复制 SSH 执行或转义示例作为生产实现。 |
| P08 | [Pi monorepo README](https://github.com/earendil-works/pi/blob/466db0fecdc20996a553116984d18c0d362b035a/README.md) | 完整读取：包清单、权限、供应链措施；措施不能推导为任意安装路径均符合本产品策略。 |
| P09 | [实验 server](https://github.com/earendil-works/pi/blob/466db0fecdc20996a553116984d18c0d362b035a/packages/server/README.md) | 完整读取：experimental、多 presentation 路由；应用负责 Session 管理及认证政策。 |
| P10 | [实验 client](https://github.com/earendil-works/pi/blob/466db0fecdc20996a553116984d18c0d362b035a/packages/client/README.md) | 完整读取：experimental、服务订阅/快照衔接、重连不自动重放操作。 |
| P11 | [Chord](https://github.com/earendil-works/pi/blob/466db0fecdc20996a553116984d18c0d362b035a/packages/chord/README.md) | 读取 1–105 行；服务、facet、复制状态与传输无关边界。未安装/实测。 |
| P12 | [Pi durable](https://github.com/earendil-works/pi/blob/466db0fecdc20996a553116984d18c0d362b035a/packages/durable/README.md) | 完整读取；当前 README 提及记录契约及 MemoryStorage，不视作已完成磁盘存储。 |
| P13 | [Pi RPC 文档](https://github.com/earendil-works/pi/blob/466db0fecdc20996a553116984d18c0d362b035a/packages/coding-agent/docs/rpc.md) | 官方网页读取；只作为现有流与队列语义参考，SDK 实际事件需版本探针。 |
| P14 | [ModelRuntime](https://github.com/earendil-works/pi/blob/466db0fecdc20996a553116984d18c0d362b035a/packages/coding-agent/src/core/model-runtime.ts) | 读取 1–175 行：credentials?: CredentialStore、配置存储、初始化网络刷新选项。 |
| P15 | [Pi package manifest](https://github.com/earendil-works/pi/blob/466db0fecdc20996a553116984d18c0d362b035a/packages/coding-agent/package.json) | 完整读取：名称、0.86.1、exports、Node >=22.19.0、MIT；不是 npm 发布状态证明。 |

P04/P05/P06/P07/P13 的固定源码链接是复查入口，不声称逐字核验了该 commit 对应整个文件。动态文档与源码冲突时，以所选发行包及测试为准，更新本证据表，不选择对当前方案有利的一边。

本次实际读取的官方网页：[SDK](https://pi.dev/docs/latest/sdk)、[Extensions](https://pi.dev/docs/latest/extensions)、[Packages](https://pi.dev/docs/latest/packages)、[Skills](https://pi.dev/docs/latest/skills)、[RPC](https://pi.dev/docs/latest/rpc)、[Security](https://pi.dev/docs/latest/security)。这些是滚动文档，不是版本锁。

## 社区组件与基础设施

| ID | 来源 | 当前决定与限制 |
|---|---|---|
| C01 | [pi-gui README](https://github.com/minghinmatthewlam/pi-gui) | 确认 thin pi-sdk-driver、Electron/React、timeline/diff/PTY 方向；仅候选模块级借鉴。本次未固定其 commit、未复制代码、未运行。 |
| C02 | [OpenPi README](https://github.com/heyhuynhgiabuu/openpi) | 当前说明为 Electron main 托管 Pi，不是独立 sidecar；参考定制资源页和职责边界。本次未完成模块、依赖与许可审计。 |
| L01 | [xterm.js](https://xtermjs.org/) | 浏览器终端组件候选；实施时精确锁版本与校验维护状态。 |
| L02 | [node-pty README](https://github.com/microsoft/node-pty) | PTY 库候选，文档说明 macOS/Linux/Windows 与 ConPTY；未验证 Electron ABI、签名或进程清理。 |

未在本次重新逐项核验的 Picot、Pi Desktop、Zosma、PI WEB 留在历史参考表，不列为已选依赖。特别注意同名仓库；禁止只按“OpenPi”或“Pi Desktop”名称复制代码。

## 采用前的门槛

1. Pi：选定已发布精确版本与包完整性；验证 API 导出、Node 与 Electron sidecar 运行时兼容；锁定传递依赖。源码 SHA 与发布 tarball 要分别记录。
2. 社区代码：记录 owner/repo、commit、源文件、LICENSE 与所需 notices；确认没有拷入凭据、遥测配置或发布身份；保留本地修改清单。
3. 扩展/安装：审计实际安装分支、默认配置发现、请求/进程权限；安全声明必须有负向测试，不凭 README 的功能清单认定。
4. 新能力缺口：先记录公开 API 是否可满足，再决定补丁/上游贡献/隔离适配；禁止默认 fork 整个 Harness。

本次交付是文档和待办调整。文档结构、摘要、链接和 JSON 检查不构成源代码安全审计、法律意见、真实模型行为验证或 macOS/Windows 发行认证。

## R01–R08 修订沿用的补充源码证据（2026-09-22）

以下 U01–U04 来自上一轮对固定 SHA 的实际读取，本轮将已审阅行为落入契约；没有因此重新运行 SDK、审计全部文件或验证发行包。内部文件仅作为行为证据，实施仍只用公开入口。

| ID | 资料 | 已核查行为与限制 |
|---|---|---|
| U01 | [Session Runtime 1–220 行](https://github.com/earendil-works/pi/blob/466db0fecdc20996a553116984d18c0d362b035a/packages/coding-agent/src/core/agent-session-runtime.ts#L1-L220) | teardown 旧实例后创建新实例，失效与 rebind 回调；失败不是自动回滚。 |
| U02 | [edit 工具](https://github.com/earendil-works/pi/blob/466db0fecdc20996a553116984d18c0d362b035a/packages/coding-agent/src/core/tools/edit.ts) | prepareArguments 兼容输入、完整定义字段、Operations、取消和 patch；未实测。 |
| U03 | [工具包装实现](https://github.com/earendil-works/pi/blob/466db0fecdc20996a553116984d18c0d362b035a/packages/coding-agent/src/core/tools/tool-definition-wrapper.ts) | 保留 prepareArguments/constrainedSampling/executionMode 等；仅说明行为，不建议内部导入。 |
| U04 | [包管理 1010–1250 行](https://github.com/earendil-works/pi/blob/466db0fecdc20996a553116984d18c0d362b035a/packages/coding-agent/src/core/package-manager.ts#L1010-L1250) | 固定 npm 版本跳过一般更新、Git ref 不同策略、显式 install/remove；未审计全部安装分支。 |

当前修订基于产品提交 `be9e1f0858e9188131c959d2438dede73c0e2215`；上文的项目基线及环境为先前核验的历史记录。新的实际发行版本和运行证据填写到 reuse-map 的 adoption/evidenceRecords，不能将本文源码版本当发行锁。

## A0/A1 实际发行验证（2026-09-22）

已采用 Pi **0.87.0** / Node **24.21.0** LTS / npm **11.19.0**。实际输入及字节校验见 [发行包记录](../validation/a0-a1-release.json)，被测提交 `7fad5e9d3af4ef70d72f71c58782f577e4aa0aca` 的命令、平台和结果见 [A0/A1 报告](../validation/a0-a1-2026-09-22.md)。0.86.1 与 466db0f 源码索引仍保留为历史资料，未冒充当前发行锁。

首次实际根 ESM import 与 10 项零模型 Session 探针通过；严格传递声明检查失败，缺口包括 JSON 类型导入和缺失的可选 MCP 类型模块，详见 [G01–G03](../validation/a0-a1-gaps.md)。已区分运行时导出、类型声明、类方法和 source-only/experimental 子入口。

后续 [收尾报告](../validation/a0-a1-closeout-2026-09-22.md) 记录代码提交 `ad6a71b6faefdeece0ef5699fbc21eafdaf6c8fe` 的严格类型、SDK、下载审计及重复初始化通过；[发行完整性记录](../validation/a0-a1-closeout-release.json) 明确区分原始 tarball 与两个 pi-ai 副本的本地声明补丁。[ADR-A0](adr-a0-pi-types.md) 固定只改 JSON 类型导入，补齐 MCP SDK 1.30.0 类型 peer；运行时字节未改。未读取 source 条件执行源码、未 deep-import、未 Fork。原失败证据保留，不能将补丁后的通过描述为官方原包无缺陷。

本轮只有内存配置/凭据和空资源注入，不验证 Provider/OAuth 或完整技能资源策略。reuse-map 中 verificationStatus=verified 仅指其 evidenceRecords.scope 明确限定的探针接缝；implementationState 仍为 in_progress，不能据此宣布完整模型/资源/配置能力可用。没有真实模型事件 fixture 或 A2 工具测试。

## A2 已采用的工具入口（2026-09-22）

代码提交 `23ba1bdc54188ee3dbbd0a744800ffea84f855ec` 实测同一 Pi 0.87.0 发行包的四个公开 ToolDefinition 工厂、defineTool、公开参数校验、MIME helper 和本地 Bash Operations。工具/Session 入口继续通过包根 ESM 导入，Pi 类型留在 adapter 和测试内部；详见 [A2 报告](../validation/a2-2026-09-22.md)。

[A2 输入审计](../validation/a2-inputs.json) 重新核对缓存官方 tarball SRI 和 12 个安装文件的原始字节，无新依赖或运行时补丁。read 的路径辅助探测、bash 的临时日志及实际宿主入口边界见 [可复现记录](../validation/a2-boundaries.md)。这不把源文件中存在但未采用的 grep/find/ls/PowerShell 标为已验证。

## A3 已采用的资源与包入口（2026-09-22）

代码提交 `c2378dd0a9c2f54daa50bc4cf843e044d3c484b2` 使用 Pi 0.87.0 根公开 Skill 加载/格式接口、ResourceLoader、DefaultResourceLoader、DefaultPackageManager 与 Session.reload/waitForIdle；类型与类方法不冒充根运行时导出，见 [9+8 项实测](../validation/a3-2026-09-22.md)。

本轮通过 Context7 阅读官方 [SDK 文档](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md) 和 [包文档](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md) 定位示例；实际行为以 [输入摘要](../validation/a3-inputs.json) 中经 SRI 核对的发行 tarball、16 个安装文件和运行结果为准。没有把 main 或文档旧版 Skill 字段替代已安装类型。

原 U04 的 pinned npm/Git 差异现已在离线真实 npm/Git 探针复现；local 包仍是引用，默认 ResourceLoader no* 标志不阻止隐式安装，具体复现和候选公开改进见 [A3 边界](../validation/a3-boundaries.md)。仅安装测试输入另有精确 registry/SRI 记录，从未作为扩展或业务模块加载；不表示采用新的产品依赖。没有上游 Fork、任意扩展启用或真实模型调用。
