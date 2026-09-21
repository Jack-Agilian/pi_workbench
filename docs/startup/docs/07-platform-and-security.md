# 07 · 跨平台、安全与发布基线

版本 0.1｜先共享产品层，再拆分执行后端；不要维护两套桌面 UI。

## 1. 首发策略

建议 macOS Apple Silicon 先实现完整任务闭环，同期完成 Windows 11 x64 的 Shell/路径/进程树/打包竖切。Windows 正式 Beta 不等到功能全部做完才移植。macOS 最低版本由选定 Electron/Node/native dependency 的官方支持矩阵与实机结果决定，不在未锁定依赖前承诺。

Windows arm64、Intel Mac、Linux 作为后续扩展目标。若首批客户明确以 Windows Office/Visual Studio 为主，调换主开发平台，但仍保持同一协议和双平台 CI。该次序是产品建议，不是技术上只能从 macOS 开始。

## 2. 共用与独立

| 能力 | 共用层 | OS 独立实现 |
|---|---|---|
| 工作台、技能、市场 | React / 状态机 / 协议 | 快捷键、窗口菜单、无障碍细节 |
| 文件与工作区 | WorkspaceRef、权限判断 | canonical path、大小写、符号链接 |
| 非交互命令 | CommandRequest / 结果 / 超时 | Shell、环境继承、引号与编码 |
| 终端 | 终端 UI / resize / session | POSIX PTY / ConPTY |
| 终止任务 | Cancel 流程 | process group / Windows Job Object |
| 凭据 | opaque account ID / Broker | Keychain / DPAPI |
| 沙箱 | BackendCapabilities / Policy | 各平台与容器/VM 的约束 |
| 发布 | 版本流程、迁移、回滚测试 | 签名、notarization、安装器、更新包 |

## 3. Shell 与路径

Pi 当前 Windows 文档以 Git Bash 为默认，并提供可选 PowerShell 工具 [S08]。产品不据此强制所有用户安装同一种 Shell：用 Runtime Doctor 探测实际环境，并为每个 Workspace 明确绑定 host-posix、host-powershell 或 host-git-bash。WSL 独立为 wsl backend，保存发行版与 Linux root。

模型只看到一个主要 `shell` 工具，description 指明语言、路径风格、cwd 与已知工具。产品自己执行 Git/进程操作优先 argv + shell:false；模型写的 Shell 脚本则由明确 Shell 解释，禁止用字符串替换在 Bash/PowerShell 间“翻译”。

macOS GUI 启动与交互终端的 PATH 可能不同，Runtime Doctor 显示实际解析到的 git/node/shell 路径和版本。P0 不默认 source 用户全部 profile；选择性导入开发环境需用户明确配置。Windows `npm.cmd`、PowerShell 版本、输出编码、空格/中文路径必须进实机测试。

WSL 项目应记录自己的 Linux 路径和运行环境；Microsoft 对跨文件系统访问有明确建议 [S27]。WSL 的互操作能力意味着它不是自动具备本项目所需的安全边界。不要把所有命令简单加上 `wsl` 前缀，仍将 Windows cwd 传入。

## 4. 进程生命周期

非交互工具走 stdout/stderr pipe；用户交互终端走 PTY，两者分别管理。node-pty 支持跨平台后端，但不是权限隔离 [S28]。

macOS 以进程组管理和信号升级为基线；Windows 用 Job Object 绑定任务进程树，设置适当关闭行为并防止创建后尚未加入 Job 的逃逸窗口。Job Object 的成员继承、breakaway 和嵌套行为要按官方语义测试，不能只杀父 PID。[S26]

不要把“关闭 ConPTY”当作所有进程树必定清理的唯一保证。Stop 要同时处理 Pi abort、Runner、PTY、开发服务器和任务租约。超时强制终止后检查端口与后代；长期服务必须登记拥有者与寿命，不能作为无主后台进程残留。

## 5. 三个不同的安全层

**Renderer 隔离。** Electron 使用 nodeIntegration:false、contextIsolation:true、sandbox:true、严格 CSP、导航限制和 IPC sender/参数验证。来自模型、网页和插件的 HTML 一律视为不可信。官方安全指南为基础清单 [S23]。

**受控本机模式。** 非管理员权限、宿主工具审批、环境变量最小化、路径约束、秘密 Broker、命令审计与进程树管理。此模式不能保护同用户主机免受恶意任意 Shell/Node 代码影响，不对外称作“强沙箱”。

**隔离运行模式。** 整个 Pi Worker 和可执行扩展进入容器/VM/远程环境，仅提供必要文件、代理和短期授权。只把 Bash 放进容器会遗漏宿主扩展；可写挂载也会让沙箱写回主机，这些边界 Pi 文档有明确提醒 [S07][S09]。

## 6. 沙箱能力协商

BackendCapabilities 不用单个 boolean 假装所有沙箱一样。记录 filesystemIsolation、networkEnforcement、processIsolation、credentialIsolation、nativeToolchain、writableMounts、enforcementEvidence。启动时核实后端真实能力；策略要求网络隔离而当前后端没有实现时，拒绝启动，不降级为“尽力而为”。

macOS/Windows 原生任意工具链与统一 Linux 隔离是不同需求。首版不自研完整 AppContainer 或 macOS 任意命令策略沙箱；先提供受控本机模式，之后增加经过验证的 Linux 隔离后端。Xcode/Windows 原生工作负载仍可选择 Host，并明确风险。

API Key 即使从环境变量移走，也可能经用户同权限文件、进程或网络泄漏。受控本机不保证长期秘密隔离；高风险运行优先用独立用户/隔离环境和限制用途的代理，不能让模型任意指定代理上游 URL、凭据 ID 和请求范围。

## 7. 审批不能只靠命令黑名单

`npm test`、编译器、Git hook 和项目脚本也可能执行任意代码；不能因命令名常见就默认安全。审批信息展示命令、cwd、运行环境、项目可信状态和资源访问范围。自由 Shell 用整体高风险能力授权，不能宣称正则识别了所有危险子命令。

对宿主文件工具使用 canonical path、目录 handle/相应 OS 安全打开方式和执行前复核，防止符号链接/重解析点以及检查后替换造成越界。对于任意 Shell，仍以 OS 隔离承担强制边界。批准请求绑定参数摘要、目标、包版本、epoch 与过期时间。

## 8. 凭据、隐私与日志

Electron safeStorage 在 macOS/Windows 使用不同系统后端，安全语义不完全等价 [S24]。宿主保存秘密，产品库和 Worker 只使用 opaque ID 或短期用途受限引用。默认不共享用户现有 `.pi/auth.json` 与所有全局扩展；导入现有配置需预览与授权。

遥测默认不采集源码、聊天、工具参数或附件；错误上报脱敏并由用户预览。数据删除覆盖 SQLite、transcript、Blob、缓存、索引和资源草稿，备份保留期限另行说明。模型服务请求会包含选定的上下文，UI 需告诉用户数据去向。

## 9. 发布与更新

按平台/架构构建原生依赖； macOS 完成签名、Hardened Runtime/所需 entitlements 与 notarization，Windows 完成安装器与可执行文件签名。Electron 官方文档覆盖不同发布要求 [S25]。不要只在开发模式运行成功就判断生产包可用。

应用、内置 Pi、原生模块和内置技能一起版本锁定。用户不在应用内部执行 `pi update` 替换打包 Runtime；升级通过 App 发布链路完成并运行 Adapter 契约测试。市场资源采用独立更新链路，但受兼容矩阵限制。

安装更新前停止/排空活动任务、备份数据库、做迁移；失败不让新旧服务同时写同一数据库。回滚二进制不一定能回滚数据 schema，必须单独验证前向/后向兼容策略。

## 10. 平台测试矩阵

必须覆盖：中文/空格/emoji 路径、仅大小写变化、只读目录、symlink/reparse point、长路径、Git CRLF、用户未提交改动、不同 Shell、无 Git 环境、缺运行时、多个 Worktree、网络中断、系统睡眠、进程树取消、终端 resize、升级时文件占用。

安全测试覆盖：恶意 Skill、自动 npm 脚本、包目录穿越、凭据出现在日志、预览 HTML 访问 IPC、跨线程审批复用、旧 epoch 事件、外部写结果未知、Connector 返回伪造指令。参考项目不能替代这些测试；P0 验收应交付每项的实际证据。
