# Agent Workbench 项目启动包

**版本：0.1 · 日期：2026-09-07 · 状态：待评审的设计基线**

临时代号 Agent Workbench，不代表最终品牌。目标是构建 **Pi + Codex 风格代码工作台 + WorkBuddy 风格技能与成果工作台**，支持 macOS 与 Windows。桌面壳按 Electron + React + TypeScript 起步；macOS Apple Silicon 完成首个闭环，Windows 11 x64 在同一阶段完成底层竖切。上述是本方案的工程建议，不是已实现状态。

## 快速阅读手册

包内 `Pi_Workbench_Startup_Handbook_v0.1.docx` 为 16 页可编辑启动手册，适合评审会；以下 Markdown 为更详细的开发规格，适合进入 Git 持续维护。

## 从哪里开始

| 文档 | 解决的问题 | 主要读者 |
|---|---|---|
| `docs/01-product-charter.md` | 产品定位、首版范围、WorkBuddy 功能映射、非目标 | 创始人、产品、全组 |
| `docs/02-system-architecture.md` | 进程边界、Pi 集成、数据所有权、恢复、目录结构 | 技术负责人、后端、桌面 |
| `docs/03-ui-and-interactions.md` | 页面结构、关键流程、状态、组件、无障碍 | 产品、设计、前端 |
| `docs/04-marketplace-and-plugins.md` | 包格式、市场、安装、权限、更新、审核 | 平台、后端、安全 |
| `docs/05-skill-library.md` | 技能管理、作用域、发现、按需加载、版本和评测 | Agent、产品、平台 |
| `docs/06-workflows-and-artifacts.md` | 连接器、专家、成果、自动化、记忆与探索 | 功能开发、产品 |
| `docs/07-platform-and-security.md` | macOS/Windows、Shell、进程树、沙箱、发布 | 桌面、平台、安全 |
| `docs/08-delivery-and-references.md` | 借鉴项目、开发 Backlog、验收门槛、风险 | 全组 |
| `docs/09-sources-and-verification.md` | 一手出处、核验范围、版本敏感点 | 全组 |
| `adr/decisions.md` | 必须先冻结的 10 个架构决策 | 技术负责人 |

`contracts/` 包含 TypeScript 产品协议、SQLite 初始模型、插件 Manifest JSON Schema。`examples/` 包含一个无可执行脚本的周报技能包及样例锁文件。它们是**接口与数据设计样例，不是已经完成的应用或安装器**；不能直接据此宣称安全隔离已经实现。

## 已采用的设计原则

产品拥有 Project / Workspace / Thread / Run、权限、包安装、调度与成果；Pi 拥有模型调用、工具循环、上下文与原生 Session。SQLite 不是 Pi transcript 的第二写入者：两类状态分权，产品只保存原生会话引用和可重建的展示索引。

安装、启用、授权、加入当前任务是四个不同动作。技能内容不是安全边界；任意 Node 扩展也不会因为声明了权限就自动受到约束。第一版只接入审核过的内置扩展，公开市场先做选编的技能与模板。

## 范围和核验说明

文档中的 [S01] 等编号对应来源文档。外部能力以公开一手资料为依据；所有 `workbench.*` 协议、表名、Manifest 字段和流程均为本项目拟定，而非 Pi / WorkBuddy 官方 API。WorkBuddy 的功能页只能证明公开体验，不能证明其内部数据库、包格式或沙箱实现。CodeBuddy CLI 的插件文档不直接视为 WorkBuddy 桌面实现。

本次核验读取了公开文档与仓库页面；未启动六个参考 GUI，未执行真实 Pi 模型请求，也未完成 macOS/Windows 实机测试。Pi `main` 的 package.json 显示 0.85.1 [S32]，只列为评估候选，不代表已核验的 npm 发布版本。G0 必须锁定发布包、Git SHA、依赖锁和测试夹具。

## 启动评审需要产出的结果

批准 P0 范围、选定技术负责人和各模块负责人；冻结 ADR-001 至 ADR-006；建立双平台 CI；用 Mock Runtime 跑通界面，再通过 Pi Adapter 竖切。不要先开发公开上传市场、支付体系或自由多 Agent 编排。
