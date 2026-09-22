# 当前实施 SSOT

更新：2026-09-22。范围：Pi 桌面工作台的复用策略、模块责任、接入边界和下一步交付。

**决策：复用优先，Pi SDK 是默认实现；薄适配只承接产品差异，不重写上游已有能力。** 用户已明确要求尽量不重复造轮子。本目录是这一要求的实施基线，不代表实现、兼容测试或团队验收已经完成。

## 阅读顺序与权威边界

1. [复用优先架构](reuse-first.md)：决定什么依赖上游、什么只包一层、什么确需自研；含替代旧方案的 ADR。
2. [模块接入契约](integration-contracts.md)：决定接口边界、权限、状态所有权和故障语义。
3. [上游证据](upstream-evidence.md)：固定源码提交、公开导出与核验限制；不把 main 上的源码当作已发布 API。
4. [机器可读复用清单](reuse-map.json)：逐项记录复用方式、上游符号/入口、产品增量和验收门槛。
5. [实施顺序](../planning/NEXT_STEPS.md) 与 [工作项](../planning/backlog.json)：唯一的当前工作顺序和验收细目；尚未创建远端 Issues。

`docs/startup/` 继续保留原始 0.1 快照、原始接口和历史报告，不改摘要。**涉及复用策略、工具接入、技能解析、模型配置、任务队列、传输选型、模块拆分和交付先后的冲突，以本目录为准。**未被本目录覆盖的产品范围、UI 体验及安全要求继续参考原快照。已落地代码和测试是实现事实；与规格冲突时报告偏差，不静默反向改写规格。

原始 `contracts/app-protocol.ts` 与 SQL 只是参考，不能整份复制作为首版必做项。当前没有新增可执行产品协议。A0/A1 已新增锁定的 Pi Session 探针依赖；尚未引入 Electron 或社区 UI。严格声明检查经 [ADR-A0 类型补丁](adr-a0-pi-types.md) 通过，原始发行缺陷及采用边界见 [A0/A1 缺口](../validation/a0-a1-gaps.md)。

维护规则见 [状态、证据与验收](maintenance.md)；本次处理清单见 [R01–R08 修订](review-fixes.md)。修订了维护脚本并明确接缝契约，不代表产品接入测试已经通过。

## 本次明确减少的自研

不另写 Agent Loop、Session JSONL/分支/压缩、Provider/OAuth、SKILL.md 解析器、包来源解析器、基础 read/edit/write/bash 工具，也不把终端渲染或 Git diff 算法重新实现一遍。产品仍拥有授权、操作审计、跨任务调度、成果索引和桌面体验。

## 验证

```bash
python scripts/check-ssot.py
python scripts/check-docs.py --structural-only
python scripts/test-tools.py
```

完整原始设计示例检查仍可用 `python scripts/check-docs.py --typecheck`，其通过不能代替真实 Pi 与 macOS/Windows 测试。检查结果生成到 `.artifacts/`，不覆盖快照里的旧报告。

## A0/A1 实际进度

[当前被测提交与脱敏报告](../validation/a0-a1-closeout-2026-09-22.md) · [本轮发行包完整性](../validation/a0-a1-closeout-release.json) · [公开入口缺口](../validation/a0-a1-gaps.md)。Pi 0.87.0 / Node 24.21.0 的零模型 Session 探针、严格应用类型检查和重复初始化通过。采用固定声明补丁及精确 MCP 类型 peer，官方原始声明缺陷仍在；历史 failed 证据保留。BOOT-03 与 CORE-02 均 in_progress，M0 三个 Gate pending。

## A2 实际进度

[被测提交与工具报告](../validation/a2-2026-09-22.md) · [输入摘要](../validation/a2-inputs.json) · [辅助 I/O 与平台边界](../validation/a2-boundaries.md)。19 项工具接缝与 4 项真实 macOS Bash 测试通过，A1 回归仍通过；没有新增依赖或改动 Pi 运行时代码。read/edit/write/bash 仅采用公开工厂与 Operations。CORE-04、SEC-02 及三项相关能力进入 in_progress；不把探针称为完整权限/平台系统。三个 M0 Gate 仍 pending，本轮未进入 A3/A4。

## A3 实际进度

[被测提交与资源/包报告](../validation/a3-2026-09-22.md) · [输入摘要](../validation/a3-inputs.json) · [缺口与边界](../validation/a3-boundaries.md)。9 项资源、8 项实际 npm/Git 探针及干净副本两轮回归通过。复用 Pi 解析/安装/Session 刷新，只新增批准快照和准入检查；默认加载器缺包隐式安装等行为已复现，运行时不采用该路径。skills/package-manager 与 SKL-01/PKG-01 进入 in_progress；resources/BOOT-03 追加限定证据，三个 M0 Gate 保持 pending。本轮停止于 A3，未进入 A4。
