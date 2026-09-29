# M1 无工具会话与配置边界

更新：2026-09-29。M1-A 是现有 ProductCore/Worker 的限定增量；M1-B 已获授权并完成首次真实回复，恢复请求曾超时，随后通过[追加续验](../validation/review-develop-m1-2026-09-29.md)完成原会话恢复和活跃取消，见 [真实报告](../validation/pi-0871-m1-live-2026-09-29.md)。当前仅 macOS arm64 / Node 24.21.0 / Pi 0.87.1，不增加依赖。此文补充 integration-contracts 的模型出口，不改变其所有权。

## 采用决定与公开入口

采用 Pi 发行包根导出的 createAgentSession、ModelRuntime、SettingsManager，以及 pi-ai 的 InMemoryCredentialStore/InMemoryModelsStore。AgentSession.prompt/subscribe/abort、ModelRuntime.getProvider/getModel/registerProvider/registerNativeProvider/setRuntimeApiKey 是类方法，不冒充根导出。Provider、FetchFunction、AgentSessionEvent 仅为适配包内类型；fauxProvider 是根运行时导出，只用于明确 SYNTHETIC 的独立测试 entry。上述入口来自已安装 0.87.0 声明/实际 import，不使用 src/core deep-import、experimental source 条件、any 或 ts-ignore。

Pi ProviderRequestOptions.fetch 是公开的 HTTP 传输注入点，不覆盖 WebSocket。保留原生 Provider.streamSimple，固定 SSE、maxTokens、timeoutMs、maxRetries=0；原生 stream 旁路拒绝。会话 retry、compaction、cache warming 关闭；tools/customTools 为空且 noTools='all'，调用前再次核实无活动工具。没有重写模型协议、SSE 解析、Agent Loop 或 Session 树。

在线准入限定为 Anthropic Messages、官方 OpenAI Responses、显式声明的 OpenAI 兼容 Responses/Chat Completions。OpenAI 目录模型可通过公开 ModelRuntime.registerProvider 仅覆盖批准的 baseUrl，保留目录能力/价格；未知模型的兼容配置通过同一公开方法注册模型元数据（文本输入、上下文、价格、token 字段），SSE/序列化仍由原生 Provider 完成。宿主只允许该配置的单一 HTTPS/443 URL，不自动探测、重试或切换。2026-09-28 初版仅 Anthropic，OpenAI 是后续离线验证增量，不代表真实服务通过。其他 API、OAuth/订阅仍未准入。配置不提供任意头、代码或 entry。

## ADR-M1-01：宿主委托 HTTP，保留 Worker 禁网

候选一：直接给 Worker 放行网络。拒绝原因：会扩大当前已验证网络隔离，并让资源/扩展具有额外出口。候选二：引入 sandbox-runtime 提供网络代理。已通过 Context7 阅读候选的 SandboxManager/wrapWithSandbox 文档，但未做发行、Mac 集成或后代验证；本轮不采用、不安装，不把阅读当实测。候选三：使用 Pi 原生 Provider 的公开 fetch seam，通过已有 Node IPC 委托宿主。选择第三项：无需 HTTP 服务、代理 daemon 或新 Agent 框架，保持当前 Worker 沙箱与 Shell 禁网。

Worker 的模型消息是本项目 IPC v5；基于实际 guardian/child 连接绑定，校验 instance/runtimeBinding/requestId。HTTP 不进入可重放事件或请求缓存，避免头部密钥持久化。宿主按批准配置核实 URL、POST、模型 ID、stream、对应 API 的唯一输出 token 上限、零 tools、期限和 Run 状态；禁 Host/Cookie/Proxy-Authorization 头，重定向使用 Node fetch `redirect:error`。每 Run 仅一请求，递增 read 身份，单个待处理 read，16 KiB 分片，响应 1 MiB、请求 24 KB 上限。非 2xx 正文在进入 Pi 前替换为固定错误，不把服务商可能反射的密钥写进原生历史。

这不是通用出网沙箱：信任固定 Node fetch/TLS 与用户批准的单一 endpoint，不接受 Worker 指定其他 URL。Worker 仍沿用 Mac OS 文件/网络 profile；固定安全测试移除 JS tripwire 后实测 SQLite 读/建库和直连本机端口被 OS 拒绝。Node --permission 不作为 SQLite 隔离证明。测试的 loopback HTTP 只是 transport/redirect 用例，不是外部 TLS/真实模型证明。

## 配置、凭据和预算

Workbench model.json 是产品授权文件，不冒充 Pi 官方 models.json。Pi 负责目录/Provider/凭据接口，产品只定义本次允许的服务、数据和限额。默认位于应用专用 Application Support 目录，不读取 ~/.pi/agent。空设置、内存凭据、批准的空资源在发现用户扩展之前构造。

凭据默认保存在应用专用、与 model.json 同目录的 auth.json，采用 Pi `{provider:{type:"api_key",key:"..."}}` 格式。它是明文文件，仅宿主在启动/重连时读取；仅接受当前用户所有、权限 0600 的普通文件，拒绝仓库内、.pi、symlink 和超限文件。薄读取层只处理字面量 key，不调用命令/环境解析，不重写 OAuth/认证协议；之后仍用公开 ModelRuntime.setRuntimeApiKey 和内存 CredentialStore。Pi 支持更广的凭据来源，但本轮不打开那些权限。空值/错误保持 key_required 且不回显解析异常。

Renderer 还保留无参数 selectModelCredential 临时动作，由 Electron 原生 dialog 选择纯文本 .key 文件；原有私有/大小校验不变。Renderer 不接收 key/路径，不允许传路径、密钥或 shell。临时选择不写回 auth.json；宿主重连重新读取持久文件，不保留临时 key。内存字符串无法保证物理擦除，不声称系统 Keychain 或 OAuth 已实现。

产品 SQLite schema v6 增加 model_requests 与 model_outcomes；v7 追加 model_policy_revisions。请求前原子预留，按 authorizationId+配置摘要累积，不以重开/失败/取消退款。官方估算来自固定 Pi 目录，兼容模式来自显式用户声明且未核验的上下文/价格：整个 contextWindow 乘输入/缓存最高单价，再加输出上限；因此很保守，可能在短输入下也拒绝。此数值并非服务商实际计费硬保证，价格和取消后计费须由 M1-B 核对；需要硬金额上限时同时使用服务商控制。修改同一授权的策略不重置账本；新的 authorizationId 代表用户另一次明确授权，不能自动生成以绕过预算。

每 Run 一 Worker，App Server 保持全局单写与同 Provider 单账户。原生 Session 继续保存上下文，未落盘输入保留为产品 Run 意图；不自动重发异常请求。HTTP 由 App Server 拥有并在结算前 abort/close，Worker done 与模型 stopReason 都不足以单独证明成功。正常完成还需闭合 Session、实际退出/组清理收据、stop/length 结果且零 Operation；没有闭合证明先 unknown，对账后失败/取消。SIGKILL App Server 会使其网络连接随 OS 进程消亡；这不保证服务商停止计费。

## 展示与回归范围

正文是可丢弃产品投影：每 150 ms 合并更新，每 Run 最多 60 次中间快照；每条最多 2048 字符，最终快照必发。只显示允许的 text，不透传整个 SDK 对象、thinking、授权头或资源路径。订阅闭包和 IPC 绑定阻断旧实例；取消不排在无界 token 事件队列后。长回复可能中途停止刷新，最终仍更新，原生历史不受展示截断影响。

M1-A 离线测试采用真实 SDK、真实进程和明确合成响应；M1-B 才能证明外部服务、真实计费与取消。现有 A1–A4、B/C、Shell、F01 退出恢复和 M0 三层验收继续有效。完整技能库、认证管理、工具 Agent、PTY 和 Windows 不在本轮。

## develop 复审后的策略与续验

模型策略使用固定字段顺序、包含嵌套 openai 的 `model-policy-v1` 摘要；工具参数摘要不变。历史 model_requests 不重写。首次规范化预留会记录配置原顺序摘要作为旧策略证明；无法用原配置证明的旧摘要保持 policy_required。宿主本地 `model:policy` 入口可追加明确的 timeout-only 修订（同 authorizationId、服务、数据范围、请求数、输出数、费用上限均不变），记录原/新摘要、规范化配置、修订 ID 和时间。相同 ID 同内容幂等，不同内容拒绝；有 queued/active/unknown Run 时拒绝。各 revision 继续累计原请求和保守预留；失败不退款。Renderer/Worker 没有策略修订或数据库路径入口。

参考当前 Pi 0.87.1 官方 settings.md，默认 httpIdleTimeoutMs 为 300000ms，retry.provider.timeoutMs 默认沿用它。本项目新配置默认等待 300000ms，并把同值传给 Pi Provider 请求上限；宿主仍保留独立硬截止，不宣称 HTTP idle 与整个 Run deadline 语义相同。Worker ready 最多 5 秒；宿主总截止为请求上限加 5 秒启动余量。主动取消最多等待 400ms 后进入进程停止；guardian 保留现有截止后 3 秒生命周期兜底，清理证据缺失仍 unknown/blocked。Pi 的默认 Agent 自动重试不采用，仍关闭 Agent/Provider 重试、缓存预热和自动压缩。

home 和新 Run 接收前检查策略与预算，显示 policy_required/budget_exhausted；已有 requestId 确认重试仍由原幂等校验处理。HTTP 发送前还在同一事务重新核验并预留，预检不是资金锁。

`validate:model-resume prepare <attempt-id>` 不读取凭据、不启动宿主、不调用网络，只读原报告及产品 SQLite，用固定旧 requestId 找回原 Thread、首个成功 Run、原生 Session 引用和账本，持久化最多两次的续验计划。`execute-approved` 再核对计划、策略、原报告摘要及实时余额，先独占创建追加结果再连接正常 HostClient。原 first 不再发，仅恢复与取消；新 attempt 的 requestId 稳定且不同于原确认重试。相同 attempt 即使崩溃也不会自动重发，原报告不覆盖。恢复失败即停，未观察到活跃流不宣称取消已验证。新增结果保存 Thread/Run/Session 绑定及关闭后的账本审计；准备计划不构成新的预算授权。
