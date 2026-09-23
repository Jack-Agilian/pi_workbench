# 当前实施 SSOT

更新：2026-09-23。范围：Pi 桌面工作台的复用策略、模块责任、接入边界和下一步交付。

**决策：复用优先，Pi SDK 是默认实现；薄适配只承接产品差异，不重写上游已有能力。** 用户已明确要求尽量不重复造轮子。本目录是这一要求的实施基线，不代表实现、兼容测试或团队验收已经完成。

## 阅读顺序与权威边界

1. [复用优先架构](reuse-first.md)：决定什么依赖上游、什么只包一层、什么确需自研；含替代旧方案的 ADR。
2. [模块接入契约](integration-contracts.md)：决定接口边界、权限、状态所有权和故障语义。
3. [上游证据](upstream-evidence.md)：固定源码提交、公开导出与核验限制；不把 main 上的源码当作已发布 API。
4. [机器可读复用清单](reuse-map.json)：逐项记录复用方式、上游符号/入口、产品增量和验收门槛。
5. [实施顺序](../planning/NEXT_STEPS.md) 与 [工作项](../planning/backlog.json)：唯一的当前工作顺序和验收细目；尚未创建远端 Issues。

`docs/startup/` 继续保留原始 0.1 快照、原始接口和历史报告，不改摘要。**涉及复用策略、工具接入、技能解析、模型配置、任务队列、传输选型、模块拆分和交付先后的冲突，以本目录为准。**未被本目录覆盖的产品范围、UI 体验及安全要求继续参考原快照。已落地代码和测试是实现事实；与规格冲突时报告偏差，不静默反向改写规格。

原始 `contracts/app-protocol.ts` 与 SQL 只是参考，不能整份复制作为首版必做项。B 已新增有限的产品 DTO/命令校验与模块级持久核心，范围见 [最小契约](b-minimal-contract.md)；[B-IPC](b-worker-contract.md) 已补有限、可校验的进程协议和宿主监督。A0/A1 引入的 Pi 精确依赖继续沿用，C 另以 [最小桌面契约](c-desktop-contract.md) 引入精确 Electron/React 与有来源的社区键盘保护片段。严格声明检查经 [ADR-A0 类型补丁](adr-a0-pi-types.md) 通过，原始发行缺陷及采用边界见 [A0/A1 缺口](../validation/a0-a1-gaps.md)。

维护规则见 [状态、证据与验收](maintenance.md)；本次处理清单见 [R01–R08 修订](review-fixes.md)。该修订只核验维护脚本和接缝契约；后续实际接入证据分别登记如下。

## 本次明确减少的自研

不另写 Agent Loop、Session JSONL/分支/压缩、Provider/OAuth、SKILL.md 解析器、包来源解析器、基础 read/edit/write/bash 工具，也不把终端渲染或 Git diff 算法重新实现一遍。产品仍拥有授权、操作审计、跨任务调度、成果索引和桌面体验。

## 验证

```bash
python scripts/check-ssot.py
python scripts/check-docs.py --structural-only
python scripts/test-tools.py
```

完整原始设计示例检查仍可用 `python scripts/check-docs.py --typecheck`，其通过不能代替真实 Pi 与 macOS/Windows 测试。检查结果生成到 `.artifacts/`，不覆盖快照里的旧报告。

以下 A0–A4/B 小节保留各阶段交付范围；当前工作顺序以 [NEXT_STEPS 顶部](../planning/NEXT_STEPS.md) 为准。最新复审修正在末节单列。

## A0/A1 实际进度

[当前被测提交与脱敏报告](../validation/a0-a1-closeout-2026-09-22.md) · [本轮发行包完整性](../validation/a0-a1-closeout-release.json) · [公开入口缺口](../validation/a0-a1-gaps.md)。Pi 0.87.0 / Node 24.21.0 的零模型 Session 探针、严格应用类型检查和重复初始化通过。采用固定声明补丁及精确 MCP 类型 peer，官方原始声明缺陷仍在；历史 failed 证据保留。BOOT-03 与 CORE-02 均 in_progress，M0 三个 Gate pending。

## A2 实际进度

[被测提交与工具报告](../validation/a2-2026-09-22.md) · [输入摘要](../validation/a2-inputs.json) · [辅助 I/O 与平台边界](../validation/a2-boundaries.md)。19 项工具接缝与 4 项真实 macOS Bash 测试通过，A1 回归仍通过；没有新增依赖或改动 Pi 运行时代码。read/edit/write/bash 仅采用公开工厂与 Operations。CORE-04、SEC-02 及三项相关能力进入 in_progress；不把探针称为完整权限/平台系统。三个 M0 Gate 仍 pending，本轮未进入 A3/A4。

## A3 实际进度

[被测提交与资源/包报告](../validation/a3-2026-09-22.md) · [输入摘要](../validation/a3-inputs.json) · [缺口与边界](../validation/a3-boundaries.md)。9 项资源、8 项实际 npm/Git 探针及干净副本两轮回归通过。复用 Pi 解析/安装/Session 刷新，只新增批准快照和准入检查；默认加载器缺包隐式安装等行为已复现，运行时不采用该路径。skills/package-manager 与 SKL-01/PKG-01 进入 in_progress；resources/BOOT-03 追加限定证据，三个 M0 Gate 保持 pending。本轮停止于 A3，未进入 A4。

## A4 实际进度

[被测提交与凭据/模型报告](../validation/a4-2026-09-22.md) · [输入摘要](../validation/a4-inputs.json) · [公开错误与生命周期边界](../validation/a4-boundaries.md)。16 项合成认证接缝通过，复用 Pi 的 store 锁、登录/刷新、目录与 Session 选型，只新增状态/结果白名单投影和隔离测试。SEC-03 进入 in_progress，models-auth/pi-settings 追加限定证据；系统凭据存储、真实 OAuth、产品 Renderer/IPC/日志仍未完成，三个 M0 Gate 仍 pending。本轮停止于 A4，下一轮才进入 B。

## B 最小产品核心实际进度

[被测提交与报告](../validation/b-2026-09-22.md) · [最小契约](b-minimal-contract.md) · [输入摘要](../validation/b-inputs.json) · [权限/恢复边界](../validation/b-boundaries.md)。17 项真实 SQLite/合成宿主测试与 5 项 Pi 接入测试通过，复用原生 Session/Runtime/write，只新增产品协调、持久事件和真实 Markdown 成果索引。product-coordination/artifact 与 BOOT-01/CORE-01/CORE-03/ART-01 进入 in_progress，新增证据只支持模块级范围。该阶段未包含真实 Worker/IPC；后续 B-IPC 进展见下方，三个 M0 Gate 仍未完成。

## 最新复审修正（2026-09-23）

[A4 审核复核](../validation/review-a4-2026-09-23.md)：F01 关闭/替换竞态、F02 跨盘范围已修正，F03 固定 M0 同 provider 单账户约束。Session 15 项、资源 12 项、认证 18 项及 B/前序回归通过；CORE-02/SKL-01/SEC-03 保持 in_progress，三个 M0 Gate pending。该次复审没有包含 B-IPC；唯一当前开发项以 NEXT_STEPS 顶部为准。

## B-IPC：2026-09-23

[真实进程验证](../validation/b-ipc-2026-09-23.md) · [进程/审批/恢复契约](b-worker-contract.md) · [被测输入与命令](../validation/b-ipc-inputs.json)。30 项混合检查、四场景驱动及原回归通过；Pi 仍拥有 Session、工具实现与原生历史，App Server 仍唯一写产品库。实际 Worker OS 文件限制、App Server SIGKILL 后固定后代清理和结果丢失只核验不重写均已测试。限定 B-IPC 完成；相关能力保持 in_progress，三个 M0 Gate pending，唯一下一步为 C 最小桌面界面及安全展示投影。

## B-IPC 审核修正（2026-09-23）

[复核与修正证据](../validation/review-b-ipc-2026-09-23.md) 保留原 0e9a01a 的四项缺陷及实际被测修正 SHA。冷启动先失效旧授权再检查清理证明，已登记成果恢复与当前可用性分开，IPC v2 严格枚举及原生路径持久确认已回归；Worker 48、Core 20、SDK 5 及 A1–A4 通过。前节 30 项属于历史范围；相关能力保持 in_progress，三个 M0 Gate pending，唯一当前项仍为 C。

## C 最小桌面：2026-09-23

[实际代码 SHA 与验证](../validation/c-desktop-2026-09-23.md) · [桌面/展示边界](c-desktop-contract.md) · [发行与命令摘要](../validation/c-desktop-inputs.json)。真实 Electron 连接独立 Node 宿主和 Pi Worker，四个无模型场景、12 项桌面检查及前序回归通过。正文投影与工具/成果视图只用产品 DTO；原生 Session 仍归 Pi。BOOT-02/BOOT-04/UI-01/UI-02/SEC-01 开始限定实施，三个 M0 Gate 保持 pending。前面“下一步 C”为历史记录；唯一当前顺序以 NEXT_STEPS 顶部的 D 待启动为准。
