# B-IPC：进程边界

App Server 是 ProductCore/SQLite、Run、Operation、Approval、ResourceLock 和成果结算的唯一权威。每 Run 一个 Pi Worker，复用公开 SDK、SessionManager、ResourceLoader 和 write/edit Operations。没有新的 Agent Loop、消息树、Provider 协议或远程服务。

Node 子进程 IPC 连接为 App Server → 生命周期监护器 → Worker。监护器属于宿主监督层，不加载 Pi、ProductCore 或 SQLite；其存在是为了在 App Server 被 SIGKILL 后仍可终止 Worker 的 POSIX 进程组并写入宿主专属目录的清理凭据。连接来源由两个实际 ChildProcess 句柄的回调闭包确定，协议 version/instanceId/runtimeBindingId 还必须匹配。消息名称是本项目设计，不是 Pi API。

协议只允许有限的初始化、ready、开始、取消、关闭、操作意图、批准结果、观察和完成消息。closed schema、64 KiB 消息上限、16 条/128 KiB 发送队列、回调驱动发送和超时在边界生效。Node 会先解析底层 IPC 数据，所以这不是抵抗任意内存耗尽攻击的承诺。Worker 不可发送 hostClean、数据库路径、任意命令或凭据配置来扩大权限。

宿主在同一 SQLite 事务内保存 dispatch 与启动日志；日志保留原绑定、批准计划、资源锁、原生目录和清理凭据身份。取消意图亦持久化。首次 Assistant 前原生 Session 尚未落盘时，产品 Run.input 仍保留请求；原生历史只由 Pi 保存。正常完成关闭 Session 并回收整个 Worker；下次通过原生文件引用恢复，不使用 Worker 池。

受限模式目前仅支持已固定 Node 的 macOS。Worker 使用独立 HOME/agentDir/Session 目录、空内存凭据与设置，只加载宿主批准的资源快照；不从用户目录先发现扩展再过滤。文件数据范围与禁网由 macOS profile 约束；Pi PackageManager 查询祖先元数据需要 Node 的 read=*，不能将它宣传为 Node FS 白名单隔离。Node 的写入、子进程、插件和线程权限另行约束。SQLite 的已知 Node 权限缺口仍通过 OS 文件规则拦截，不支持平台直接报错。

工具与故障驱动只能通过测试入口的可信组合注入；Renderer 仍只有既有四种产品命令。当前生产 entry 不配置模型驱动，不能调用真实模型。测试驱动标记 SYNTHETIC，在真实 Worker 内调用已注册的真实 Pi 工具。

此文是实现契约。实际执行范围、失败和被测 SHA 由后续 docs/validation 记录；契约和测试数量不能替代 M0 Gate 证据。

## 宿主审批与结算

当前可信宿主组合只批准一个 write/edit Markdown 意图，绑定归一化参数摘要、相对目标、已有 fileVersion、预期结果摘要、资源锁、运行绑定和期限。Operation ID 在宿主 SQLite 内生成；Worker 的工具调用 ID 只作关联。批准命令提交之后，宿主再次核对文件版本、资源内容和期限，事务领取成功后才回授授权；Pi Operations 在实际写前再检查版本/取消/期限。取消不能撤销已发生的写入。

Worker 的 result/done/closed 都只是输入。宿主自行读取文件，用原 Operation 登记成果，等待监护器核验整个固定进程组消失后才能结算。断开或 kill 后未确认操作为 unknown，不自动重发。显式 recover 重开真实产品状态，凭受保护的清理记录及文件摘要将操作对账；崩溃 Run 最终只能 failed 或 cancelled，不能推断为 completed。缺清理证据或文件呈第三种状态时保持阻断，不能靠 PID/退出码或 Worker 的自报释放名额。

正常路径完成后 Worker 与 Session 一起关闭。订阅游标和快照属于产品数据库；重新订阅只读取事实，不调用工具。投影目前仍是事件类型标签，C 必须补正文/工具摘要的安全展示，不能把这些标签或 SDK 对象当作聊天时间线。

## 启动窗口与受限恢复范围

SQLite dispatch 事务的准备阶段启动宿主监护器，但监护器必须等待事务提交后的 arm 才能创建 Worker。宿主在事务内失败会断开未授权的监护器；提交后立即被强杀也由监护器留下“没有创建 Worker”的证据。这样不存在“已持久派发，但监督进程尚未启动”的无人接管窗口。未知消息或当前连接的身份/版本错误隔离该连接，不解释为完成事实；旧连接闭包和 UI/其他子进程均不能按消息中的字符串路由到当前 Run。

清理记录验证 instanceId、runtimeBindingId、随机 nonce、实际 Worker 退出及进程组不存在。宿主只在所拥有的监护器确已退出且从未 arm 时自行记录零 Worker 启动证明；已 arm 的情况必须有监护器的 OS 观察。监护器也被杀或证据丢失时，close 共享同一个失败结果，保留审计与全局阻断，不猜测清理成功。没有用持久 PID 盲杀重启后的其他进程。

验证范围为 macOS 固定、非 detach 的父/子测试命令及其心跳文件；监听端口在该 OS profile 下被拒绝，没有运行开放端口的 Shell 产品功能。没有证明任意恶意进程、重新 setsid 的后代、监护器也遭破坏后的自动恢复，或系统重启/断电时收据与 SQLite 的跨文件系统原子性。没有证据时继续阻断。文件版本检查不是原子 CAS，第三方文件竞争仍是 A2/B 已记录边界。
