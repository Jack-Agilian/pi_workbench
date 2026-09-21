# 09 · 来源与核验边界

**检索日期：2026-09-07。** 本包使用一手官方文档和项目仓库资料；[Sxx] 对应下列来源。资料引用用于支持外部能力事实，设计表名/接口/权限/安装流程均为本项目提案。

## 核验状态

已做：公开文档核查、仓库架构与许可标识核查、当前 Pi 文档事件语义检查、本包本地结构样例验证。未做：完整仓库克隆与逐行审计、六个 GUI 实际运行、真实 Pi 模型调用、跨平台实机验证、安全隔离实现验证。

Pi main 的 package.json 显示 0.85.1，SDK 文档包含 ModelRuntime / AgentSessionRuntime 等接口，不能把前序讨论中的示例直接当成固定版本接口。启动 Gate G0 必须记录 Git SHA、发布包摘要、精确依赖锁、SDK 声明和 fixture；在完成前不要将此文档的日期当作可重现依赖锁。

WorkBuddy 只作公开产品体验参照。其内部包格式、安装器、权限实现与数据库未获一手源码验证。CodeBuddy CLI 文档即使在同一域名，也不被当作 WorkBuddy 桌面协议证明。MCP 参考选定的 2025-11-25 版本，实际开发要明确支持范围并协商。

## 来源目录

### [S01] Pi 项目 README

https://github.com/earendil-works/pi

核验范围：包层次与安全边界；仓库页面，不代表全部依赖许可。

### [S02] Pi SDK

https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/sdk.md

核验范围：SDK、ResourceLoader、Session 与 Runtime API；main 快照。

### [S03] Pi RPC

https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/rpc.md

核验范围：当前 JSONL、事件、队列、取消、累计工具输出；历史版本需验证。

### [S04] Pi Extensions

https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/extensions.md

核验范围：工具与扩展 API；TUI UI 不等同于桌面 UI。

### [S05] Pi Packages

https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/packages.md

核验范围：资源打包、来源、配置和安装行为。

### [S06] Pi Skills

https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/skills.md

核验范围：技能发现、按需加载、校验与名称冲突。

### [S07] Pi Security

https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/security.md

核验范围：项目信任不等于沙箱；同进程扩展权限与风险。

### [S08] Pi Windows Setup

https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/windows.md

核验范围：Git Bash 默认与可选 PowerShell 工具。

### [S09] Pi Containerization

https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/containerization.md

核验范围：整个进程隔离与仅工具路由的不同边界。

### [S10] Agent Skills Specification

https://agentskills.io/specification

核验范围：SKILL.md、元数据、资源目录；allowed-tools 是实验字段。

### [S11] pi-gui

https://github.com/minghinmatthewlam/pi-gui

核验范围：README 架构、main/preload/renderer 和 pi-sdk-driver；未运行。

### [S12] OpenPi

https://github.com/heyhuynhgiabuu/openpi

核验范围：README 权责、main 监督 sidecar；未运行。

### [S13] Picot

https://github.com/shixin-guo/picot

核验范围：打包 Pi Runtime、项目隔离、会话 UX；未运行。

### [S14] Pi Desktop

https://github.com/gustavonline/pi-desktop

核验范围：Tauri + Lit、extension-first、发布与功能映射入口；未运行。

### [S15] Zosma Cowork

https://github.com/zosmaai/zosma-cowork

核验范围：通用桌面任务定位与技术文档入口；未验证全部扩展兼容。

### [S16] PI WEB

https://github.com/jmfederico/pi-web

核验范围：持久会话/工作区与明确的受信用户安全假设；未运行。

### [S17] WorkBuddy FAQ

https://www.workbuddy.ai/docs/workbuddy/From-Beginner-to-Expert-Guide/FAQ

核验范围：公开功能入口、技能更新体验；非内部实现资料。

### [S18] WorkBuddy Explore

https://www.workbuddy.ai/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Explore

核验范围：案例、Prompt/Skill/Expert 组合的公开说明。

### [S19] WorkBuddy Model Configuration

https://www.workbuddy.ai/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Model

核验范围：模型管理的公开体验；不采用其价格或模型时效列表。

### [S20] WorkBuddy Memory

https://www.workbuddy.ai/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Memory

核验范围：记忆功能公开说明；本方案数据表为自研。

### [S21] WorkBuddy Changelog

https://www.workbuddy.ai/docs/workbuddy/Changelog

核验范围：仅参考可见功能与修复主题；不据此断言最新版号。

### [S22] CodeBuddy CLI 插件市场文档

https://www.workbuddy.ai/docs/cli/plugin-marketplaces

核验范围：本次完整页面读取失败，仅检索摘要；不用于证明桌面内部协议。

### [S23] Electron Security

https://www.electronjs.org/docs/latest/tutorial/security

核验范围：Renderer、IPC、导航和内容隔离官方建议。

### [S24] Electron safeStorage

https://www.electronjs.org/docs/latest/api/safe-storage

核验范围：系统凭据加密后端及平台差异。

### [S25] Electron Code Signing

https://www.electronjs.org/docs/latest/tutorial/code-signing

核验范围：签名、平台发布与 notarization。

### [S26] Microsoft Job Objects

https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects

核验范围：Windows 进程组管理、继承与终止语义。

### [S27] Microsoft WSL filesystems

https://learn.microsoft.com/en-us/windows/wsl/filesystems

核验范围：Windows/Linux 文件系统与互操作边界。

### [S28] Microsoft node-pty

https://github.com/microsoft/node-pty

核验范围：跨平台 PTY 与原生构建、安全说明。

### [S29] MCP Authorization 2025-11-25

https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization

核验范围：采用明确版本作为设计参考，不宣称这是当前唯一最新版。

### [S30] MCP Security Best Practices 2025-11-25

https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/security_best_practices

核验范围：token、授权和不可信服务安全原则。

### [S31] Codex App Server

https://developers.openai.com/codex/app-server

核验范围：官方请求/事件/审批设计参考；读取时重定向至 learn.chatgpt.com/docs/app-server。

### [S32] Pi coding-agent package.json

https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/package.json

核验范围：本次读取 main 中 version=0.85.1；未核验 npm 发布物和固定 SHA。

### [S33] Pi LICENSE

https://raw.githubusercontent.com/earendil-works/pi/main/LICENSE

核验范围：MIT 文件核验；复用时仍需逐项确认依赖/资源许可。

## 启动时需要补录的依赖清单

| 项目 | 本次状态 | G0 要求 |
|---|---|---|
| Pi SDK | 0.85.1 为 main 元数据中的候选 | 精确发布包版本、SHA、integrity、完整事件测试 |
| Electron / Node | 未指定生产版本 | 选择支持目标 OS 的版本，锁定构建链与更新策略 |
| node-pty / SQLite native binding | 未指定 | 对每个平台/架构验证 ABI 与打包 |
| 六个参考 GUI | 公开 README 核查，未选固定 commit | 若复用源文件，固定 commit 并记录来源、许可证与修改 |
| Office 生成/预览依赖 | 未选定 | 格式质量、许可证、CJK、沙箱、签名与安装体积评测 |
| MCP | 参考 2025-11-25 | 固定 SDK、传输和授权支持矩阵，做互通测试 |

本包校验结果见 `tests/validation-report.json`。这些校验只覆盖样例数据结构，不代表产品、参考项目或上述平台能力已经实现。
