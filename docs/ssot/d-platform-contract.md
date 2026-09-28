# D：平台执行接入

D 按可审查增量推进。D1 是 macOS 应用退出闭环；后续才是 Shell/PTY 产品链路及 Windows 实机验证。当前不提供通用命令执行、后台 Worker 池或完整平台沙箱，不启动市场、真实账户/模型或生产发行。

## D1：关闭与对账

继续使用 Electron 44.4.5 的公开 app/BrowserWindow 退出事件、现有 HostClient、DesktopHost、ProductCore、WorkerSupervisor 和 guardian。Pi 仍拥有 Session 与工具实现。没有新增依赖、数据库表、Worker 协议或 Renderer 权限。

1. 窗口关闭、app.quit、SIGTERM/SIGINT 都进入同一 before-quit 路径，先阻止新请求和重连。重复关闭等待同一次清理结果，不先退出 Electron。
2. DesktopHost 设置 closing 后，按既有产品 runs.cancel 命令持久记录 queued/starting/running 的取消；cancelling 继续等待，unknown 只对账。关闭不再派发队列，原意图与审批/操作审计保留。取消已经发生的文件副作用不等于回滚。
3. 等待 Supervisor 停止拥有的 Worker/guardian，再调用既有 recover。只有真实收据、进程组停止、原 Operation 文件版本和原生引用均满足条件，才结算并关闭 SQLite。既有 completed 成果不改写；不确定文件版本或缺收据仍导致关闭失败。
4. HostClient 的 code/signal 只解释受信任 entry 的关闭结果。正常 code=0 不能替代 guardian 收据；SIGKILL 不是正常退出。App Server 被强杀时，尚未落盘的关闭/取消不能推定已接受；恢复依据实际取消审计字段决定 failed 或 cancelled。
5. 主进程等待所有现有/候选宿主清理结算，即使其中一项先失败，也不能提前放行。清理失败保留窗口与提示，旧 HostClient 保持原关闭失败。

显式重连若原宿主仍活着，也先按此流程关闭其工作；UI 提示此影响。原宿主已经被强杀的情况继续使用既有冷恢复语义，不能把一个未收到的关闭请求当作已持久取消。尚未派发的产品意图与未确认的已执行操作仍是不同状态，不通过事件回放重做工具。

## 关闭失败后的可用恢复路径

用户可在原窗口选择“重新连接”。关闭失败的旧客户端先通过 waitForExit 确认实际 exit+disconnect，主进程再创建一个新 HostClient；不得重置旧对象的失败 Promise 或借此宣称原关闭成功。

新宿主启动先从真实库读取旧状态并对账；缺证据时仍是 blocked/unknown，窗口可读取状态并选择“核验并恢复”。此按钮只调用现有 recover，不伪造清理收据、不自动重发副作用。未解决的外部文件版本需要真实恢复依据，本轮不提供绕过核验的按钮。

候选新宿主在 ready 前、发布前都受主进程关闭状态约束。若同时再次关闭，等待候选清理，不发布迟到实例；失败的候选继续保留实际退出屏障，避免下一次重连与仍存活的 SQLite 写入者重叠。Renderer 仍不能选择可执行文件、数据库位置或进程句柄。

## 验证边界与后续增量

`npm run test:desktop-shutdown` 在独立中文/空格临时目录启动实际 Electron，按场景执行真实退出，由外部项目 Node 检查 exit/signal、will-quit、拥有的 PID、真实 guardian 收据与进程组，再只读重开测试 SQLite。正常退出不使用 app.exit 冒充；SIGKILL 场景明确记录异常退出。合成故障驱动仅在可信测试入口中，不能从 preload 调用。

固定不脱离进程组的父/子命令另由现有 Worker fixture 验证，检查 PID、心跳文件稳定和 OS 拒绝监听端口；不等于任意恶意/setsid 后代、开放网络端口回收或通用沙箱证明。原生 dialog 只核对调用参数，没有人工点击验收。实际代码 SHA、命令和限制见 [D1 验证](../validation/d-exit-2026-09-24.md)。

D1 结束时的下一增量规划为 D2：在同一产品审批、Operation、IPC 与工具边界接入 Shell/PTY，核验终端库的发行/许可/ABI，再实现必要平台接缝。Windows 需要真实可用环境；当前没有已确认环境和实测证据，继续明确未支持。不要以 D1 的 Mac 中文目录、已有 Pi Bash 探针或类型通过替代 Windows 验证。BOOT-05、终端完整采用和 M0 Gate 尚未完成。

## D1 复审确认的 D2 前置边界（2026-09-28）

[D1 复审](../validation/review-d1-2026-09-28.md) 未发现新增合并阻断项；以下是下一增量的准入条件，不是已实现能力。

- Agent 非交互 Shell 继续复用 Pi 公开 ToolDefinition/Operations；用户交互 TerminalSession 单独授权，默认不向 Agent 开放输入能力。终端库仍是待核验候选，不能将审核建议当作发行/许可/ABI 验证。
- 已安装 Pi 0.87.0 的本地 Shell 在 POSIX 使用 `detached: true`；现有 guardian 只证明 Worker 所在组已消失。D2 必须监督实际 Shell/PTY 正常创建的进程组，并覆盖 Worker/宿主死亡，不能沿用 D1 固定同组后代的结论。通过公开 Operations 委托受管后端，不 deep-import 或全局替换 spawn。
- 当前 ExecutionPlan 只包含 write/edit。D2 应区分文件、Shell 与终端事实；命令退出、进程清理、外部副作用和 Artifact 分别记录。无成果命令可以成功，失败命令可能已经产生副作用；恢复不能自动重发或以文件不存在证明无副作用。
- 按 D2-S 受限非交互命令、D2-T 单用户终端、D2-X 真实 Shell/PTY 退出矩阵分增量验收；Windows 仍需实际环境。该次复审没有启动其中任何增量，后续 D2-S 实施见下节。

## D2-S：受限非交互 Bash（2026-09-28）

复用 Pi 0.87.0 的 `createBashToolDefinition`、`BashOperations`、同名受控工具、参数验证和原生 Session；不使用 main 源码或内部 detached tracker。原本地 Operations 在 POSIX 自建 detached 组且公开返回只有退出码，不能让已经死亡的 Worker 为宿主提供持久清理证明。因此只把 Operations.exec 委托给既有 guardian 内的单命令执行模块，使用 Node 公开 spawn/流解码与系统 Bash；没有复制 Shell 语言、Pi 输出算法或建立通用执行服务。后续若 Pi 公开可监督句柄/宿主清理 seam，可替换此后端，仍保留产品审批和故障回归。

- App Server 持久化 Shell Operation；批准摘要绑定归一化 Pi 参数摘要、实际命令、规范 workspace、固定 profile/环境策略、不可复用 Run/runtime 身份与期限。Worker 请求只与宿主预选计划核对，不能指定 executable/env/数据库路径。审批一次领取后，Worker 通过原通道请求 exec，guardian 只接受实际宿主通道的单次 arm；没有批准或已经取消/到期/资源改变均不启动。
- Guardian 在 spawn 前已拥有本次执行对象；Bash `detached: true` 形成独立组，Worker 不增加 child_process/addon 权限。正常结束清理 Bash 同组后代；超时、取消、Worker/宿主断开统一停止 Bash 和 Worker。原 cleanup 收据只有两组清理均成功才允许 groupGone。新增宿主保护目录中的 Shell 收据含精确身份、Operation、PID/组、退出码/信号、超时与有界输出。Worker 的 done/result 不能伪造这些事实。
- Shell 固定 `/bin/bash --noprofile --norc`，白名单环境与每 lease 独立 HOME；只允许工作区/自身 HOME 写入，拒绝网络、产品库、收据和资源目录访问。Mac arm64/固定 Node 是限定已测平台，其他平台失败关闭。HOME 不从工作区跟随链接创建。该 OS 配置不等于任意恶意命令沙箱，不承诺绕开组的 setsid/系统服务或 guardian 本身 SIGKILL 后的清理。
- SQL schema v5 在既有 Operation 下增加 Shell 意图/结果投影；Pi 仍拥有原生消息历史。IPC v4 增加闭合 shell-exec/shell-result，不接收 Worker 自报 hostClean。旧版本连接拒绝；v1–v4 数据库向前迁移，回退旧二进制不受支持。
- 完成时 stdout/stderr 各收集前 4000 原始字节并解码；非法/不完整 UTF-8 用 U+FFFD 替换，解码后每路按共享 8192 UTF-8 字节预算保留完整码点前缀。剩余输出持续排空但不入队；原始或编码后预算截断均显示原超限标志（见 [S01 复审](../validation/review-d2s-2026-09-28.md)）；一次发送有界结果快照。聊天/UI 只显示纯文本，既有已知模式脱敏不是任意秘密过滤器，真正隔离依靠空凭据/禁网/OS 目录限制。D2-S 不提供实时终端流或全量日志；Pi 自身的结果处理继续复用，传输截断单独明确标记，不伪称保留全部字节或 stdout/stderr 的交错顺序。
- 命令自然成功可无 Artifact；非零退出、取消、超时都不推导文件已回滚。已经启动的命令结果标为 sideEffects=possible。崩溃时有效自然退出收据只用来对账原 Operation，不重新执行；异常信号中断而未持久取消/超时的操作仍 unknown/blocked。没有可验证收据则不释放全局名额。本轮不实现通用 Shell 外部副作用解决器。

演示入口仅由 trusted --demo 组合选择两个固定命令；输入 `/demo-shell` 或 `/demo-shell-wait` 选择演示，其他文本继续原 Markdown 路径，不将用户文本解释为 Shell。CLI 四场景也是同一 DesktopHost/产品命令链路的明确合成驱动，不是新 CLI 产品。执行证据见 [D2-S 报告](../validation/d2-shell-2026-09-28.md)；下一项 D2-T，终端及 Windows 仍未实现/验证。

## 路线调整（2026-09-28）

D2-S/S01 已集成 develop。此前“下一项 D2-T”为历史安排；按 [当前路线](../planning/NEXT_STEPS.md) 优先 M1/M2，PTY 不阻塞无工具真实会话。Shell 禁网、进程组和收据边界继续保留，新增模型出口不授予工具联网权限。
