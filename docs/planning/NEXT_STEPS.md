# 从文档到可运行产品：复用优先

状态：A0/A1 探针、严格类型检查与重复初始化通过；产品阶段仍待实施。决策依据：[SSOT](../ssot/README.md)。工作项见 [backlog.json](backlog.json)；历史原始范围见[原始 Backlog](../startup/docs/08-delivery-and-references.md)。尚未创建 GitHub Issues。

## 1. 下一增量不是再造平台

**M0-A：Pi 公开 API 接入探针 + 最小桌面/产品契约。**先证明能复用，再逐步连接 UI，不先编写独立 Agent Runtime、技能解析器或工具库。Mock 保留为确定性测试与演示手段，不能成为另一套算法或伪造真实 Pi 事件。

| 顺序 | 工作 | 复用/差异 | 验收 |
|---|---|---|---|
| A0 | 选定发布包与运行时 | 固定 Pi 发行版本、tarball/lock，核对 exports/Node；源码 0.86.1 仅候选 | 正确 Node 环境可 import 已用公开符号；不依赖 experimental source 条件 |
| A1 | SDK Session 探针 | createAgentSession/SessionManager/Runtime | in-memory/保存恢复/订阅替换；原生记录不被产品库重写 |
| A2 | 基础工具接缝 | Pi 同名工厂、Operations、截断/diff | 包装前后语义一致；拒绝不执行；无旁路；取消与context不串 |
| A3 | 受控技能和包探针 | Pi Skill/ResourceLoader/PackageManager | 未批准 factory 不执行；resolve 不隐式安装；包安装副作用审计 |
| A4 | 凭据与模型探针 | ModelRuntime + CredentialStore | 前端只收到状态；登录/刷新/模型目录不另写；无密钥进日志/env |
| B | 最小产品协调与持久化 | 自有Run/Operation/Approval/Artifact，其他交给Pi | 幂等、事件快照、取消清理和unknown状态；没有第二套Session树 |
| C | Electron/React工作台 | 定向选 pi-gui/OpenPi 组件，验证后局部移植 | timeline/composer/工具卡/审批/成果；新环境可启动，保留来源和许可 |
| D | Mac闭环 + Windows执行竖切 | 现成Shell/PTY库 + 必要OS监督 | 中文路径、终端resize、进程清理及应用退出；跨平台不靠字符串替换 |
| E | 本地技能库与精选目录 | Pi内容模型 + 产品启用/快照/安装事务 | 普通SKILL.md可导入，更新不改变活动Run；未知可执行插件不开放 |

A0–A4 是 BOOT-03 / CORE-02 范围内的小型可行性探针，不等于提前完成全部工具、包管理和安全工作项。生产级 CORE-04 仍需 BOOT-05 平台验证，PKG-01/02 的完整市场安装交付仍为 P1；探针只提前揭示依赖能否复用。

A0–A4 的无模型部分可以与 B/C 的 Mock 视图并行。真实付费模型调用须有账户与费用授权；不调用 Provider 的导出/资源/文件工具测试不能声称验证了模型行为。Windows不等Mac全功能完成才验证。

## 2. 暂定目录：减少不必要拆分

```text
apps/desktop/            # Electron/React
apps/agent-server/       # 一个模块化宿主，含产品/资源/审批/成果模块
packages/app-contracts/  # 可校验跨进程DTO
packages/pi-adapter/     # Pi公开SDK与Operations薄适配
packages/platform/       # OS/PTY/进程监督，依赖现成库
```

Mock/fixtures 先作为测试与开发入口。每个目录不必都成为独立发布包，不增加自研插件微内核、通用RPC生成器、Provider层或npm解析器。

## 3. 社区复用准入

`pi-gui` 优先考察 thin SDK driver、timeline/diff/terminal；`OpenPi` 优先考察 Customizations/资源配置与特权边界。只在固定提交、许可证和模块依赖核查后局部移植；不同时拼六套应用。Pi TUI组件不作为React组件使用。

Pi server/client/Chord/durable 按 [SSOT](../ssot/reuse-first.md) 记为评估项；发布、认证、持久化、平台和接缝能力证明前不替换SDK主路径，也不自研同功能框架。

## 4. 开工依赖与集成验收依赖

`dependencies` 表示开发前置；`acceptanceDependencies` 表示完成集成验收前必须完成的额外工作。Mock/接口可以提前并行，不能据此绕过实际 SDK/授权/平台验收。两类边的联合图必须无环，done 要有满足的前置与逐条证据。

CORE-04 的工具接缝验收增加 BOOT-03/CORE-02/SEC-02；SEC-03 的凭据验收增加 BOOT-03/CORE-02。CORE-03 的 P0 包含同 Workspace 写 Run 串行（M0 可全局单写）；CORE-05 仍是 P1 的并发/Worktree 扩展。R06 固定包升级在 A3/PKG 阶段验证，不阻塞 A0/A1，也不把所有实验候选的评估作为前置。

## 5. M0 分层验收（不是三套实现）

| Gate | 必须证明 | 不能推导 |
|---|---|---|
| M0-UI | Mock 桌面工作台、任务/审批/取消/恢复、真实 Markdown 文件；记录所测平台，主闭环在 Mac | 不代表 Pi 接入或模型调用 |
| M0-SDK | 真实发行包与完整性、公开导出、原生 Session、本地工具、受控资源/宿主接缝；可以不调用模型 | 不代表真实 Provider/模型行为 |
| M0-Pi | M0-UI 与 M0-SDK 后，获授权真实模型完成任务，含审批/取消/恢复及 Mac 平台证据 | 不代表未测 Windows、强沙箱或签名发布 |

状态独立记在 `backlog.json.milestones`，所需证据不齐保持 pending/blocked；M0 总闭环只有三个 Gate 均通过才算通过。不具备账户/费用/平台条件时仍可推进 UI 和无模型 SDK 测试，绝不把 Mock 结果晋级。Pi 加入后 UI 不改业务模型，原生 Session/压缩/模型协议继续由 Pi 负责。

每个PR列出“复用了什么 / 只新增了什么 / 对应证据与测试 / 尚未验证的平台”。文档检查、真实SDK、真实模型与平台E2E分别记录。未完成任务不得改为done；远端提交必须独立读回确认。

本轮修订范围及 planned 用例见 [R01–R08](../ssot/review-fixes.md)；可持续状态与证据规范见 [SSOT 维护](../ssot/maintenance.md)。

## A0/A1 本轮范围（2026-09-22）

已固定 Node 24.21.0 / npm 11.19.0 / Pi 0.87.0；新增最小 `packages/pi-adapter`、显式应用初始化、离线探针和下载审计。严格 NodeNext 类型检查通过 [ADR-A0](../ssot/adr-a0-pi-types.md) 固定声明补丁与精确 MCP 类型 peer 解除阻塞，BOOT-03 改为 in_progress。CORE-02 仅推进 Session 绑定、替换和三类失败探针，仍为 in_progress；未完成产品 Run 归属。当前被测提交与证据见 [收尾报告](../validation/a0-a1-closeout-2026-09-22.md)，原始发行缺口和历史失败保留。

M0-UI、M0-SDK、M0-Pi 保持 pending。本轮 A0/A1 收尾后停止；下一轮才开始 A2 基础工具接缝，优先复用 Pi 同名工厂与 Operations，不扩大本轮范围。
