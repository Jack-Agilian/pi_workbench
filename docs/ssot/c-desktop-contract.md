# C：最小桌面工作台契约

本轮是 macOS arm64 的显式无模型演示桌面，复用 B 的 ProductCore、WorkerSupervisor、批准资源及 Pi Session/工具。不是完整客户端、模型产品或新的 Harness。实际代码 SHA、命令与未覆盖项见 [C 验证报告](../validation/c-desktop-2026-09-23.md)。

## 进程与权限

Renderer → sandbox preload → Electron main → 固定项目 Node App Server → 既有 guardian/受限 Pi Worker。App Server 继续是 SQLite 唯一写入者。Electron 不以自己内嵌 Node 的 SQLite 替代产品宿主；实际内嵌运行时与独立宿主分别记录。

窗口启用 sandbox/contextIsolation/webSecurity，关闭 nodeIntegration/webview。只服务 workbench://desktop 下三项固定本地资源；CSP 禁止网络、内联脚本、frame、对象及表单导航。拒绝新窗口、导航和权限请求；没有任意 URL 打开、任意 IPC channel、FS、Shell、数据库或凭据桥。主进程验证实际 WebContents、顶层 frame 对象和完整文档 URL，然后再次解析闭合产品 schema。不能仅凭 Renderer 声称的身份授权。

preload 只提供 home/thread/events/command/preview/recover/reconnect。四种既有副作用命令继续由 ProductCore 幂等处理；查询和重连不回放命令。请求最多 64 KiB、16 个在途；宿主响应最多 1,200,000 字节，发送队列受限。主机异常转换为固定错误码，不传原始异常。过大的历史返回受控失败；尚未实现分页，不能宣称无限历史可用。

Electron 启动器及 App Server/Worker 都构造环境白名单，不继承 Provider 凭据、NODE_OPTIONS 或用户 Pi 目录。`--demo` 的 workspace、资源、数据库、浏览器数据都位于独立项目演示 profile；Renderer 不能更改映射、可执行文件、工具参数或资源锁。App Server/Worker 的 SDK 网络 tripwire 与 Worker 既有 macOS 文件/网络限制保留。Electron 的 CSP/请求拦截不是整个 OS 的网络沙箱证明。

## 展示而非第二套 Session

Pi 0.87.0 公开 SessionManager.getBranch 提供原生条目。Adapter 按当前 Worker/Run 收集本次条目，只投影 user/assistant 的 text、原生 entry ID 和截断标记；丢弃 thinking、tool arguments/results、Provider/model/usage、异常及扩展元数据。单次最多 16 条、每条 2,048 字符、合计 8,000 字符，超出有可见提示。已知 token/key/控制字符形式脱敏，不承诺识别任意自然语言秘密。

本项目 Worker IPC v3 增加 presentation 替换快照，仍沿用 64 KiB Worker 上限和实际通道/不可复用绑定校验。它不是 Pi 官方事件，也不是增量 append；旧绑定不能更新新 Run。产品库 schema v4 只增 run_display 这一有限展示缓存；v1/v2/v3 前向迁移保留请求和原生引用。缓存不能用于恢复模型上下文、执行工具或重写 JSONL；原生历史仍归 Pi。丢失缓存后的自动原生重建，以及模型流式 delta/累计结果尚未实现。

用户目标来自持久 Run.input，所以首次 Assistant 前也可展示。工具卡、审批、Run 状态和成果来源始终来自宿主产品状态，不由合成 Assistant 文字决定。正文、目标路径和 Markdown 预览均作为 React 纯文本渲染；不执行 HTML，不加载图片/链接，不注入完整 SDK 对象。

## 生命周期与产品行为

- 支持建 Thread、独立 Run 队列、仅本次允许/拒绝、活跃停止、真实 Markdown 成果和版本/来源/changed 预览。演示只新建固定 Run ID 派生的文件，前置 fileVersion=null；批准的具体目标、参数摘要、期限和身份仍由宿主核验。
- 合成驱动位于单独 entry，仅由可信 `--demo` 宿主选择；在实际 Worker 内调用注册后的真实 Pi write。用户输入只是 Markdown 内容，不能选择任意代码/工具/路径。执行前有固定演示延时以检查取消；它不是模型响应速度。
- 取消请求接受、操作结算、Pi 结束和进程清理继续分离。unknown 保留阻断与原操作，核验按钮只调用已有 recover，绝不重发副作用。成果字节实际存在且摘要匹配才登记。
- UI 以 snapshot.cursor 开始轮询持久事件，有变化再取替换快照。Thread 切换、异步预览与关闭有 generation/身份保护；重连重新取快照，不靠事件重放执行工具。草稿按 Thread 保存在窗口内；窗口重启不持久保留草稿。已发送输入仍在产品库。
- 未确认 Run 命令按 Thread 保存原 requestId 和完整参数，创建 Thread 单独保留待确认意图；确认前内容暂不可编辑，可明确重试同一次提交。Ack 到达才清除对应意图；确认后相同内容的新任务仍生成新 ID。不会因切换 Thread、轮询或重连自动重发；未确认意图不跨窗口重启持久保存。
- App Server 断连撤销所有在途请求，不自动重试；显式重连必须等待原宿主退出且 IPC 断开后才创建新宿主。此次运行时实测有 exit+disconnect 而没有 close 的组合；无 stdout/stderr 管道，因此用前两者确认旧 SQLite 写入进程退出。Worker/后代清理仍由 guardian 的既有证据确认，不能由这个宿主 PID 推导。
- 应用关闭先阻止新请求/新宿主，等待既有 supervisor 清理、关闭数据库并退出 App Server。HostClient 保留真实 code/signal：受信任 entry 只有清理成功才无信号退出 0，非零/信号/超时必须返回清理未确认。重复关闭共享完成或失败；清理失败保留告知和审计。此判断不用于永久拒绝异常退出后的显式重连；新宿主仍按既有证据对账。关闭与重连竞争不会发布迟到宿主。App Server 被 SIGKILL 后 Worker 清理与冷恢复沿用 B-IPC。原 C01/C02 缺陷及修正证据见 [审核复核](../validation/review-c-2026-09-24.md)。

## 采用与范围

Electron 44.4.5、React/React DOM 19.3.0、esbuild 0.28.2 和 React 类型 19.3.0 精确入唯一 npm 锁。其余 Pi/Node/npm/声明补丁不变。默认文档 bootstrap 不变；应用 bootstrap 的 npm ci 始终禁 scripts。Electron 二进制由显式 prepare 命令下载官方归档、核对固定 npm 包的 SHA-256 后用系统 ditto 解包；启动不隐式下载，也不运行 Electron 的自动下载 index.js。esbuild 使用已安装的可选平台二进制，无 postinstall。

社区准入仅局部移植 pi-gui `0b4cd334942ac01bfc6b3cba736a79984925d8cf` 的 Enter/Shift/IME 防误发送逻辑，增加 legacy 229/repeat 保护，移除上游 steer/followUp。完整 Composer/timeline 与其 SessionDriver 耦合，未整体复制。许可与来源见 [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES.md)；不能把这段移植称为整个社区工作台已复用。

尚无真实 Provider/模型、系统凭据库、消息流式渲染、扩展 UI、任意工作区选择、文件另存为、完整历史分页、终端、Windows 桌面/执行验证、签名安装和生产通用沙箱。窗口截图与 Electron 程序化断言不等于原生输入法、屏幕阅读器或人工全平台验收。M0 三个 Gate 保持 pending，下一实施增量按 NEXT_STEPS 顶部单列。

后续 [D1 退出契约](d-platform-contract.md) 已补正常宿主关闭时持久取消活动/排队 Run、真实对账后退出，以及关闭失败后在原窗口创建新客户端恢复。C 的共享失败语义保留；D1 是后续增量，不把原 C 测试记录改写为已覆盖正常 Electron 退出矩阵。
