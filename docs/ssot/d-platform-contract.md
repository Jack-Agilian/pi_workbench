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

下一增量为 D2：在同一产品审批、Operation、IPC 与工具边界接入 Shell/PTY，核验终端库的发行/许可/ABI，再实现必要平台接缝。Windows 需要真实可用环境；当前没有已确认环境和实测证据，继续明确未支持。不要以 D1 的 Mac 中文目录、已有 Pi Bash 探针或类型通过替代 Windows 验证。BOOT-05、终端完整采用和 M0 Gate 尚未完成。
