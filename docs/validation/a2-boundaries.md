# A2 工具探针：公开入口与未覆盖边界

输入继续为 Pi 0.87.0 / Node 24.21.0 / npm 11.19.0，沿用 A0 的精确依赖、声明补丁与唯一锁。没有新增依赖或上游运行时补丁。这里只实现 `read/edit/write/bash` 的本地、零模型接缝探针，不是生产权限系统或平台沙箱。

## 采用的公开入口

- `createReadToolDefinition`、`createEditToolDefinition`、`createWriteToolDefinition`、`createBashToolDefinition`：保留完整定义，只替换 execute；元数据比较使用同一工厂实例的原始字段，避免误把两个工厂创建的不同 renderer 闭包视为丢失字段。
- `ToolDefinition`、`BashOperations`：仅 adapter 内部和测试类型。文件 Operations 按公开工厂类型结构注入，每次调用创建独立闭包。
- `detectSupportedImageMimeTypeFromFile`：受控路径核验后复用公开 MIME helper；读图测试显式关闭自动缩放，未实现图像处理算法。
- `createLocalBashOperations`：真实 Shell 测试复用官方进程执行和进程组取消，不自写进程树杀除器。
- `createAgentSession`、`defineTool`：SDK 同名注册与显式 allowlist；`getAllTools`、`getActiveToolNames`、`agent.state.tools` 核对有效注册。
- pi-ai 的 `validateToolArguments`：无模型测试驱动器显式调用一次公开 prepareArguments、一次公开校验，再执行 SDK 注册的工具。没有复制归一化、校验、Agent Loop 或生成模型事件流；不将该驱动器说成实际模型触发工具的 E2E。

官方资料由 Context7 定位，最终以已安装发行包 docs/sdk.md、examples/sdk/05-tools.ts、公开声明和实际调用为准。查看 dist 实现只用于核对 I/O 边界，代码不 deep-import。read 的裁剪、edit 的兼容参数/匹配/换行/BOM/diff/patch、bash 的流解码/裁剪/临时日志均仍由 Pi 负责。

## G-A2-01：Operations 不覆盖所有辅助 I/O

Pi 0.87.0 的 read 在进入 `ReadOperations.access` 前，用自身路径解析器调用 fs.access 探测文件及 macOS 名称变体。图片处理还可能涉及 MIME 检测和缩放；本探针显式注入公开 MIME helper，关闭缩放。bash 的 OutputAccumulator 用 Node fs 直接写 tmpdir 下的截断日志，不经过文件 Operations。

可复现：运行 `npm run test:pi-tools` 的 `tool-io-coverage`，合成 BashOperations 输出超过限制时，没有任何文件 Operations 写调用，Pi 仍生成完整日志；测试验证其真实字节、原生截断结果和受管理 TMPDIR。`read-path-helper-boundary` 创建 macOS 窄空格名称变体：原生 read 自动找到它，受控 read 在 Operations 入口发现实际目标不同而拒绝，实际文件 Operations 零执行。路径探测的发行证据文件为 `dist/core/tools/path-utils.js`、`read.js`；它们未被作为应用导入路径。

目前措施：先审批再进入 Pi execute；限定普通 workspace 路径，拒绝 `~`、`@` 和 Unicode 空格别名，不复制 Pi 路径解析算法；每个实际 Operations 目标必须等于已批准目标。临时目录由父启动器隔离并自动清理，SDK 进程采用窄 Node 文件权限、网络 tripwire，真实 Shell 测试另有 macOS OS 规则。

候选方案：生产 Worker 由已验证 OS 边界覆盖辅助 I/O；或向上游提出可注入的路径解析/日志存储入口。未授权对外发 Issue，未 Fork/修改运行时，也没有把“Operations 接好了”宣称为完整沙箱。搜索工具、PowerShell、远程 Operations、自动图片缩放尚未采用。

## G-A2-02：前置 hash 与符号链接检查不是原子 CAS

每次操作绑定独立 operationId、固定 Run/runtime/workspace 身份、最终参数摘要、deadline 和一次批准。edit/write 同时核对批准的文件版本、Pi 读取版本以及写入前版本；派生写入内容的 hash 单独记录。外部修改会导致 write_conflict，而不是要求内容 hash 等于输入 hash。

普通文件、路径穿越和符号链接负向测试通过，但 lstat/read/hash/write 之间仍存在外部竞争窗口，不能保证恶意进程原子替换下的安全写入。Pi 自带文件修改队列仅覆盖自身范围。生产工作区准入、跨进程互斥、句柄级约束和未知副作用结算仍属 BOOT-05/CORE-03/SEC 后续工作；本轮不另写文件系统框架。

取消后已完成的写入仍以原 operation 身份记录 `write_completed`；它不能进入新绑定，也不能被谎报为回滚。旧 output callback 被隔离，迟到事实仍归旧身份。这里是探针观察，不是产品数据库审计交付。

## G-A2-03：注册表保证与平台范围

SDK allowlist 只启用四个同名受控定义；额外尝试激活 grep/find/ls/powershell 无效，拒绝审批时所有 Operations 零执行。这个结论限定在已注册的模型工具路径。公开 `AgentSession.executeBash` 等宿主能力不属于这条注册路径；本探针不使用它们，产品宿主以后必须独立治理，不能把原始 Session 对象交给不可信调用者。

`npm run test:pi-shell` 只支持本轮实测 macOS，其他平台明确失败而非跳过。固定合成 Shell 命令在独立临时环境中使用官方本地后端；确认运行中的 Shell 与其子进程收到取消/超时后均已退出。未覆盖主动脱离进程组的恶意后代、Windows Job Object、PowerShell、完整平台执行设施或产品沙箱。

Node 24 的 spawn 会通过生成的 NODE_OPTIONS 向子 Node 传播权限标志；这不是继承用户 NODE_OPTIONS。Shell 二进制不执行 Node 权限规则，因此专门的 Shell 模式额外限制 OS 写入仅在受管理临时根，拒绝读取用户主目录数据（允许仓库文件和必要祖先 metadata）及合成 canary，拒绝 network*。实测子 Node socket 创建返回内核 EPERM/EACCES，子 Shell 读写 canary 被拒绝；不是仅凭配置文字判断。

这些规则仅用于固定、受信任的测试代码，不是产品沙箱实现。未请求 sudo、系统设置变更或额外系统权限。A1 与普通工具测试继续禁止子进程；只有独立 Shell 测试显式允许。测试结果不得推导为 CORE-04、SEC-02、M0-SDK 或 M0-Pi 已完成。
