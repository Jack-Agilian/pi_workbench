# Agent Shell：逐命令受限执行契约

2026-09-30。沿用 M2 与 D2-S；当前集成和验收状态以 [NEXT_STEPS](../planning/NEXT_STEPS.md) 为准。它是 Pi 桌面工作台的接缝，不是新的 Harness、Provider 或 Shell 实现。

## 采用与权限

继续使用 Pi 0.87.1 根导出的 `createBashToolDefinition`（运行时工厂）、`BashOperations`（仅类型），以及公开 ToolDefinition 的 `executionMode: 'sequential'` 成员。Worker 的原生工具通过既有 `controlled-tools` 委托宿主/guardian；Pi 继续负责 Agent Loop、参数定义、非零退出的工具错误、模型续轮、Session 与原生 JSONL。没有新依赖、deep-import、第二份消息树或通用 RPC。

Context7 固定版本查询有部分结果指向上游 main/设计材料，未把这些片段当作发行版 API。实际入口以已安装 0.87.1 公开声明、既有工具适配和本次 SDK 测试为准。Electron 目录选择复用官方 `dialog.showOpenDialog` 的 `openDirectory`，沿用主窗口/主 frame 来源校验和无参数 preload 包装。

旧配置默认不开 Bash。新增显式 `shellTools`，三个必填字段：`maxCommands`（1–16）、`timeoutMs`（100–30000）、`profile`（固定 `restricted-bash-v1`）。需要已有 `fileTools`，沿用其每 Run 总操作数、模型调用数和操作审批期限；maxCommands 不得超过 maxOperations。每条 Bash 可省略 timeout，使用策略值；显式 timeout 为秒，必须为整毫秒且不大于策略。命令非空、无 NUL，最多4096 UTF-8字节；不接收自由 cwd/env/可执行文件字段。

Bash可读写批准目录内多类文件，**不属于仅Markdown权限**。运行根目录取自宿主持久 Workspace，环境为既有 sterile-v1，禁网和文件范围继续使用已测 Mac profile。配置目录、产品数据库、资源与guardian收据不因开放Bash而授权。Worker仍不获得子进程/数据库/直接网络权限。工具输出会进入原生模型上下文，审批页明确数据去向。

策略摘要包含 shellTools；旧的“只修订等待期限”入口不能添加或扩大它。既有真实请求/费用账本、M0全局单写、同provider单账户与LLM 30分钟总期限/5分钟空闲默认值不变。Bash的短执行超时不等于LLM总期限；人工审批时间属于Operation期限。

## 操作与恢复

1. Worker提出 `shell-operation`（本项目IPC消息，非Pi API）。宿主校验连接身份、资源lock、顺序和额度，生成独立Operation/审批摘要，绑定规范参数、命令执行策略、实际workspace、资源、Run/runtime身份和期限。
2. 人工批准后只能领取一次。宿主核对状态/期限/资源，发回参数摘要；Worker再申请执行，宿主先事务保存 `shell.launch`，再向自己拥有的guardian通道派发。Renderer不能传入命令执行请求或选择worker entry。
3. guardian复用ShellExecution，每条命令独立实例、独立进程组和 `<operationId>.json` 原子收据；不覆盖旧命令。只允许一条活动命令，拒绝重复Operation和超额度。命令退出后清理固定的同组后代，结果含exitCode/signal/timeout、分路有界输出、截断和可能副作用。
4. 宿主从收据校验绑定、nonce、Operation及groupGone，独立结算原操作，再向Pi返回结果。普通非零退出保留Operation=failed，允许Pi提出下一条需重新批准的命令；它不被改写为成功。模型最终正常结束且所有操作均已知/允许继续、宿主HTTP及进程清理完成时，Run才可completed。拒绝、超时、取消、启动失败或未知结果阻断后续准入。
5. guardian关闭时保存带原绑定/nonce的命令清单，再保存总清理收据。重开真实产品库后，只有清理证据齐全才对账：已启动命令读原收据；已记录派发但不在关闭清单中的操作可证明未启动。未知信号中断且无取消意图仍unknown/blocked，不能凭进程退出码假报成功。任何恢复路径都不重发命令。

SQL v9前向增加 `model_shell_operations`（审批意图/启动标记）与 `desktop_workspace`（所选目录），不改写v8消息或费用记录。IPC v7增加封闭的 `shell-operation`，其他限长/背压/请求关联/来源绑定延续。旧guardian磁盘日志按其已保存字段恢复，不接纳旧版本在线Worker消息。

Bash成功不自动登记成果，也不扫描整个目录假定无副作用；Markdown write/edit仍由宿主核实摘要后登记。Shell生成的文件可以在后续单独批准的read中进入上下文，但read不生成Artifact。结果丢失只核验原收据/文件，不再执行一次来“验证”。

## 工作目录与展示

目录只来自Electron主进程的原生选择框，经私有宿主通道登记。产品/Renderer协议不接受自由路径；空选不变更。拒绝与应用profile或已配置凭据目录重叠的目录；有queued/活动/unknown任务时不切换。新目录产生新Workspace身份，已有Thread的目录不改变。选择持久化，重连不重建Run；启动时检查登记路径仍为原规范路径。

界面保留三栏；新会话使用所选目录，当前会话显示实际cwd、Bash禁网/隔离环境、模型数据去向和真实阶段（等待模型/审批/执行工具/停止清理）。工具卡显示独立命令结果，有界纯文本；已就绪模型的高级配置可折叠，缺配置/预算错误保持可见。当前截图验收尺寸为1320×860、1024×720、820×640，不代表完整无障碍/任意长历史验收。

## 验证边界

`test:product-model-shell` 使用实际Pi、Worker、guardian、Bash、SQLite和文件，模型响应为明确合成的OpenAI Chat Completions/Responses SSE。`test:desktop-agent-shell` 使用实际Electron及Pi工具，Provider与原生dialog选择结果为合成输入。`demo:agent-shell` 是可复用产品链路的离线演示，不能冒充真实模型自主决策。

本轮没有真实模型请求。受限模式只支持已验证Mac arm64/固定Node；无PTY、Windows、任意恶意逃逸/脱组后代保证。Shell记录缺失或不可对账仍阻断，不提供强制释放按钮。初始化、新克隆、人工中文输入法/读屏及真实长流未由本轮测试证明。真实模型任务须核定数据/目录/工具和费用范围。2026-09-30用户已取消累计/单Run的LLM请求次数上限；旧4次消费保留，费用仍累计，不能据此自动启用Bash或扩大目录。
