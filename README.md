# Pi Workbench

**当前实施入口：[复用优先 SSOT](docs/ssot/README.md)。** Pi 现有能力优先直接依赖或薄适配；原启动包保留为历史快照。

基于 Pi 的跨平台桌面 Agent 工作台，面向代码任务与通用知识工作。

**当前阶段：A0–A4、真实 Worker/IPC、Mac 桌面/退出及受限 Shell 已限定验证，M1-A 无工具会话离线增量已完成。** 当前证据见 [M1 报告](docs/validation/m1-2026-09-28.md)；[模型配置入口](docs/MODEL_CONFIGURATION.md) 可稍后填写。M0-UI/M0-SDK 按既有条件通过；真实模型调用仍为 0，唯一下一项是获授权的 M1-B，M0-Pi、其他平台与生产发行尚未完成。

## 从这里开始

| 入口 | 用途 |
|---|---|
| [文档导航](docs/README.md) | 架构、UI、技能库、市场、安全与阶段计划 |
| [原始启动包](docs/startup/README.md) | 用户上传的 v0.1 完整资料，逐字节保留 |
| [环境初始化与检查](docs/DEVELOPMENT.md) | macOS/Linux/Windows 入口、离线模式、验证、发布 |
| [导入记录](docs/IMPORT.md) | 来源摘要、迁移方式、历史与本次验证的区别 |
| [下一阶段开发](docs/planning/NEXT_STEPS.md) | 从文档进入可运行 MVP 的工作顺序 |
| [Backlog JSON](docs/planning/backlog.json) | 保留原始 ID、可持续扩展的任务与验收状态，尚未创建 GitHub Issues |

启动资料放在 `docs/`；可复用检查和隔离启动器位于 `scripts/`，Pi 适配与产品 DTO 位于 `packages/`，产品宿主位于 `apps/agent-server/`，桌面位于 `apps/desktop/`。文档来自重新上传的 `Pi_Workbench_Startup_Pack_v0.1.zip`，**不是之前 66 文件仓库或另一套 Pi Desktop 文档的完整恢复**。

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
