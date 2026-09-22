# Pi Workbench

**当前实施入口：[复用优先 SSOT](docs/ssot/README.md)。** Pi 现有能力优先直接依赖或薄适配；原启动包保留为历史快照。

基于 Pi 的跨平台桌面 Agent 工作台，面向代码任务与通用知识工作。

**当前阶段：A0–A2 零模型 Pi Session/工具探针通过，严格声明检查经固定类型补丁通过；桌面应用尚未实现。** 当前证据见 [A2 报告](docs/validation/a2-2026-09-22.md)，前序见 [A0/A1 收尾](docs/validation/a0-a1-closeout-2026-09-22.md)。

## 从这里开始

| 入口 | 用途 |
|---|---|
| [文档导航](docs/README.md) | 架构、UI、技能库、市场、安全与阶段计划 |
| [原始启动包](docs/startup/README.md) | 用户上传的 v0.1 完整资料，逐字节保留 |
| [环境初始化与检查](docs/DEVELOPMENT.md) | macOS/Linux/Windows 入口、离线模式、验证、发布 |
| [导入记录](docs/IMPORT.md) | 来源摘要、迁移方式、历史与本次验证的区别 |
| [下一阶段开发](docs/planning/NEXT_STEPS.md) | 从文档进入可运行 MVP 的工作顺序 |
| [Backlog JSON](docs/planning/backlog.json) | 28 个待办的结构化数据，尚未创建 GitHub Issues |

所有启动资料均放在 `docs/`；`scripts/` 只包含可复用的仓库辅助脚本。文档来自重新上传的 `Pi_Workbench_Startup_Pack_v0.1.zip`，**不是之前 66 文件仓库或另一套 Pi Desktop 文档的完整恢复**。

## 快速检查

需要 Python 3.10+。默认初始化不联网、不修改全局配置，不安装 Electron/Pi。

```bash
bash scripts/bootstrap.sh --offline
.venv/bin/python scripts/check-docs.py --structural-only
.venv/bin/python scripts/check-ssot.py
```

完整示例测试需要依赖；有网络时显式安装：

```bash
bash scripts/bootstrap.sh --install-test-deps
.venv/bin/python scripts/check-docs.py
```

TypeScript 检查另需已安装的 `tsc`，使用 `--typecheck` 明确启用。完整命令及 Windows 入口见开发说明。

禁止提交 deploy key、API key、令牌或本地凭据。仓库自检的私钥扫描仅覆盖常见文件名和 PEM 标记，不能替代完整秘密扫描与安全审查。
