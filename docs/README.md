# 文档导航

**使用版本：用户重新上传的 Pi Workbench Startup Pack v0.1。**完整原包保存在 `startup/`，其内层 `docs/` 是原包目录结构，保留它是为了不破坏引用、测试路径和 SHA-256 清单。

## 当前实施基线

**[复用优先 SSOT](ssot/README.md)** · [架构与替代决策](ssot/reuse-first.md) · [模块接入](ssot/integration-contracts.md) · [上游证据](ssot/upstream-evidence.md) · [复用清单](ssot/reuse-map.json)

当前设计不再把 Pi 已提供的 Session、工具、模型、技能解析和包管理列为自研引擎；自有实现聚焦产品治理和桌面体验。`ssot/` 指定的替代范围优先于原始快照。

## 原始产品与技术规格（历史快照）

| 专题 | 文档 |
|---|---|
| 产品定位与 P0 范围 | [01 产品章程](startup/docs/01-product-charter.md) |
| 进程边界、运行时与存储 | [02 系统架构](startup/docs/02-system-architecture.md) |
| 工作台、Composer、审批和成果 | [03 UI 与交互](startup/docs/03-ui-and-interactions.md) |
| 安装、权限、签名、更新与撤销 | [04 插件市场](startup/docs/04-marketplace-and-plugins.md) |
| 技能启停、范围、版本锁和测试 | [05 技能库](startup/docs/05-skill-library.md) |
| 连接器、专家、成果与自动化 | [06 工作能力](startup/docs/06-workflows-and-artifacts.md) |
| Shell、进程树、沙箱与发布 | [07 跨平台与安全](startup/docs/07-platform-and-security.md) |
| 参考项目、28 项 Backlog 与 Gate | [08 实施与参考](startup/docs/08-delivery-and-references.md) |
| 一手来源与历史核验范围 | [09 来源与核验](startup/docs/09-sources-and-verification.md) |

[Word 启动手册](startup/Pi_Workbench_Startup_Handbook_v0.1.docx) · [架构决策](startup/adr/decisions.md) · [产品协议](startup/contracts/app-protocol.ts) · [数据库草案](startup/contracts/initial-schema.sql) · [技能示例](startup/examples/weekly-report/README.md)

## 本次新增的工程准备

[开发与初始化](DEVELOPMENT.md) · [导入记录](IMPORT.md) · [初始导入验证记录（历史）](VALIDATION.md) · [下一步开发路线](planning/NEXT_STEPS.md) · [结构化 Backlog](planning/backlog.json)

原包发布日期、依赖候选版本和原始测试报告均按历史资料处理。2026-09-21 的新核验与实施决策见 `ssot/`；没有恢复后一套未上传的 Pi Desktop 专题资料。

当前修订记录：[R01–R08 修订与验收边界](ssot/review-fixes.md)。每次测试的即时输出位于 `.artifacts/`；历史报告不代表当前提交、Pi 接入或目标平台验证。

A0/A1 当前记录：[严格类型修复与收尾验证](validation/a0-a1-closeout-2026-09-22.md)；[首次发行包与 Session 探针](validation/a0-a1-2026-09-22.md) 保留历史失败。包含被测提交、字节完整性、声明补丁与 macOS 证据，不代表完整 M0-SDK 或模型验收。

A2 当前记录：[工具接缝与真实 macOS Shell 验证](validation/a2-2026-09-22.md) · [采用边界](validation/a2-boundaries.md) · [输入摘要](validation/a2-inputs.json)。CORE-04/SEC-02 仅推进探针范围，完整产品验收和三个 M0 Gate 仍待完成。

A3 当前记录：[受控资源与包探针](validation/a3-2026-09-22.md) · [公开入口和隔离边界](validation/a3-boundaries.md) · [发行包及测试输入](validation/a3-inputs.json)。SKL-01/PKG-01 进入 in_progress，完整技能库/市场及 M0 Gate 未完成。
