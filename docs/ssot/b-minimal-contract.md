# B 最小产品核心契约与采用决定

状态：限定的模块级实现；真实测试与提交证据由 B 验证报告登记。它不替代本目录的模块接入契约，也不意味着桌面应用或完整 B 集成完成。

## 本次边界

只新增 `apps/agent-server` 与 `packages/app-contracts` 中确实使用的模块；复用既有 `pi-adapter`。产品宿主是 SQLite 唯一写入方。Adapter 只接收不可复用身份和观察端口，没有产品库依赖。早期模块测试在同一受控进程组合两个模块；后续 [B-IPC](b-worker-contract.md) 已连接实际子进程与受限 IPC，Electron 尚未实现。

原生 Session 的消息、树、压缩与恢复始终由 Pi 管理。产品表只存 workspace 注册、Thread/原生引用、独立 Run 意图、Operation/Approval、Artifact 版本、产品事件和幂等响应。用户提交但未运行的输入属于产品命令意图，不另复制 Pi 消息。列表/事件不发送原生文件路径、绑定或模型对象。

## 产品命令与宿主权限

`threads.create`、`runs.start`、`runs.cancel`、`approvals.resolve` 接受有限字段的 JSON 对象；拒绝未知字段、函数、访问器、任意路径/绑定/凭据和未实现命令。每条命令带 requestId；相同 ID/相同规范化命令在重启后返回原确认，相同 ID/不同内容拒绝。accepted 只表示请求已持久接受，不表示执行完成。

workspace ID → 真实目录由可信宿主注册，不能由 Renderer 临时覆盖。绑定、原生引用、操作声明/领取/结果、重绑定、恢复和对账是宿主端口，不是公开 UI 命令。此处分离尚不构成已验证的 IPC 鉴权边界；UI、来源认证、CSP、策略版本和受控登录留待后续实现。

## Run 与操作结算

独立输入只进入 SQLite 产品队列，不同时送入 Pi steer/followUp。显式 dispatchNext 在单个 SQLite 事务中把 queued 改为 starting 并创建 run/thread/workerEpoch/sessionGeneration/runtimeBindingId，提交后才返回给宿主执行。应用检查及 SQLite 唯一索引共同保证数据库范围内全局单写；它比同 workspace 单写更保守。starting/running/cancelling/unknown 均占用名额。当前每个 Run 最多一个未结算 Operation，不新增并行工具调度器。

操作绑定已归一化参数摘要、toolCallId、目标和期限，产品生成 operationId。批准只是待执行许可；领取时再次核验当前 Run/绑定/摘要/期限，一次领取后不能重放。过期批准不会自动执行，用户可取消以撤销挂起许可。写入内容摘要与参数摘要独立；原操作结果及迟到副作用归属不随当前 Run 改变。

取消立即撤销未开始许可，运行中操作仍需明确结算。idle/agent_end 观察均不能单独完成 Run。终结要求宿主报告 Pi 已 idle、宿主执行已清理、无待审批/待执行/执行中/unknown 操作；取消中只能终结为 cancelled，已完成副作用不伪报回滚。unknown 操作会立即使 Run 进入 unknown 并使当前绑定失效，阻止下次派发。

未确认派发/外部副作用在重开后不重发。冷启动独占宿主先用 fencePreviousHost 将旧 epoch 逻辑失效并保留 unknown/审计；这一动作不等于清理。宿主核验旧 Worker 停止后，recoverAfterCrash/逐操作和 Run 对账才可进入结算。对账缺少清理证据时继续占用名额。原模块测试使用合成宿主清理证据；B-IPC 另外依据所拥有的进程句柄、固定进程组及宿主专属清理记录结算，不声称覆盖任意恶意进程树。

## 持久事件与成果

状态、幂等响应和事件在同一 SQLite 事务提交。事件具有全局 cursor 和 Run 内单调 runSeq；只含必要身份、有限事件/来源标签，不含原始 SDK payload。snapshot 在读事务内捕获 cursor；订阅从该 cursor 读持久事件，先前窗口的事件可补齐。同步本地监听器支持取消、异常隔离、重入及分批读取；其他连接的提交需显式 poll。这里没有自研通用消息总线，也没有宣称网络传输或异步客户端确认协议已实现。

成果只接收真实、至多 1 MiB 的 UTF-8 Markdown 文件。必须关联已成功操作、相同目标路径和实际写入内容 hash，不能把模型文字或相同内容的其他文件当产物。保存版本/hash/来源，预览再次读取并核对；外部改变返回 changed，缺失返回 missing。预览返回纯文本而非 HTML，不实现 Markdown 渲染器。符号链接和越界路径拒绝；路径检查与文件打开之间仍非 OS 原子 containment，文件与 SQLite 也不是分布式事务。

## Node SQLite 采用决定

采用已固定 Node **24.21.0** 的公开 `node:sqlite` / DatabaseSync，实际 SQLite **3.53.4**。该精确版官方文档标记 **Stability 1.2（Release candidate）**，不是本产品打包运行时的稳定性保证。只用构造器、exec、prepare/get/all/run、close 等已实测公开入口，禁用扩展加载，使用 STRICT 表、外键、显式事务和 schema user_version；产品数据库文件设为 0600。没有更改 Node 版本或引入额外数据库包。

候选为成熟的独立 SQLite binding；当前没有既定依赖，首次引入会新增原生二进制、安装脚本审核及 Worker ABI 验证。本轮已有受支持固定 Node，先把实验范围限制在该版本开发宿主，保留替换空间。发行/Worker 工具链选型时必须再次评审 API 稳定性与平台证据，不能由此跳过 BOOT-05。没有复制数据库引擎或引入服务器数据库。

已发现此运行时的 DatabaseSync 文件访问不受本轮 Node `--permission` 文件白名单约束。因此 B 测试必须叠加已验证的 macOS OS 文件规则，拿合法合成数据库证明读拒绝、新文件证明写拒绝；禁用子进程/worker/addon 和网络仍保留。其他平台入口明确失败，不回退开放环境。B-IPC 已在 macOS 验证实际 Worker 的宿主目录与数据库隔离；不是对任意插件的完整沙箱承诺。

## 未纳入本次闭环

B-IPC 的进程监督、受限 IPC、单操作跨进程审批/资源锁和显式对账已实现。真实模型/Provider、桌面 UI、通用权限策略、自动恢复重跑、并行工作区、文件另存为、事件裁剪和系统密钥库均未实现。Mock 回调与真实 Pi Session/文件工具证据必须分别登记。BOOT-01/CORE-01/CORE-03/ART-01 只能按本次范围推进，三个 M0 Gate 保持 pending；唯一下一步为 C 的最小桌面界面。

B-IPC 初版 schema v2 增加 worker_launches 宿主恢复日志；审核修正后的 v3 仅追加 Thread 原生引用的 native_persisted 标记。v1/v2 前向迁移已验证，未知版本拒绝，不支持降级。日志和标记都不保存 Pi 消息树，最新范围见 [审核修正报告](../validation/review-b-ipc-2026-09-23.md)。
