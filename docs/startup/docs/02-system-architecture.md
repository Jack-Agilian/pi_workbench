# 02 · 总体技术架构

版本 0.1｜建议基线：Electron + React + TypeScript + 独立 Node Pi Worker。UI 不导入 Pi 内部类型；所有跨进程数据由宿主 Schema 校验。

## 1. 分层与进程边界

```text
React Renderer（时间线、成果、技能库、市场、审批）
                | 最小 Typed IPC
Electron Main / Preload（窗口、系统对话框、更新、Keychain/DPAPI）
                | 私有本地协议
App Server（产品状态、Run 调度、资源解析、权限、包管理）
       |                     |                         |
Pi Worker A             Pi Worker B             Broker Services
Pi SDK + 自有 Adapter   Pi SDK + 自有 Adapter   工具/连接器/成果/凭据
       |                     |                         |
       +---------- ExecutionBackend -----------------+
         macOS Host / Windows Host / WSL / Isolated Linux

本地数据：SQLite + Pi transcripts + Blob Store + Package Store
可选云服务：签名 Registry 索引、包下载、撤销列表；不默认上传会话
```

Pi SDK 公开支持自定义 UI、事件与资源加载 [S02]。推荐把 SDK 放入本项目自己启动的 Worker，而不是放入 Electron Renderer/Main。这样保留 TypeScript 集成能力，同时得到故障与生命周期隔离。Pi CLI RPC 用于兼容性测试或第二种后端，不必同时维护两套主实现。[S02][S03]

App Server 可先是一个 Node sidecar 中的模块化单体，不为每个服务启动微服务。活跃线程绑定专属 Worker；空闲时可回收并用原生 Session 恢复。一个 Run 对应一次顶层用户请求及其自动循环；同线程同一时刻最多一个活动 Run。用户排队的后续请求由 App Server 排程为下一个 Run，避免归属不清。

## 2. 模块责任

| 模块 | 拥有的状态与行为 | 禁止承担 |
|---|---|---|
| Desktop Host | 窗口、通知、托盘、签名更新、系统凭据接口 | Agent Loop |
| App Server | Project、Workspace、Thread、Run、事件日志、资源锁 | 直接修改 Pi 消息树 |
| Pi Adapter | 建 Session、事件归一、abort、资源输入、版本差异 | 产品业务规则与市场安装 |
| Policy/Tool Broker | 权限判断、审批绑定、可审计工具执行 | 用模型文本作为授权 |
| ExecutionBackend | cwd/路径、进程树、PTY、隔离能力探测 | 假设所有平台都有 Bash |
| Package/Skill Service | 下载、校验、注册、版本选择、投影目录 | 启动任意 npm 安装脚本 |
| Artifact Service | 注册、版本、预览、导出、来源 | 从聊天文字猜文件存在 |
| Connector Broker | 账户绑定、OAuth、限流、工具调用 | 把长期 token 放入提示词 |

## 3. 核心对象模型

Project 是业务分组；Workspace 是确定运行时中的根目录，可以是 Git Worktree，也可以是普通文件夹。Thread 绑定 Workspace；Run 绑定本次 ResourceLock、ModelConfig、PermissionSnapshot。ArtifactVersion 绑定创建它的 Run 与已核实的 Blob。

```text
Project -> Workspace -> Thread -> Run -> ToolCall / Approval / ArtifactVersion
                               -> PiSessionRef
Package -> PackageVersion -> Resource（Skill/Template/Preset/Extension）
Installation -> ScopeActivation -> RunResourceLock
ConnectorDefinition -> ConnectorAccount -> RunBinding
Schedule -> Job -> Run
```

路径存 `runtimeId + pathFlavor + canonicalRoot`；UI 显示 displayPath。不将 Windows、WSL 和 macOS 路径混为字符串。Git 操作锁按仓库/Worktree 资源划分；MVP 同 Workspace 的写入 Run 串行。Worktree 隔离代码副本，不隔离网络、用户凭据与共享缓存。

## 4. 数据所有权：避免双写两套会话真相

Pi 原生 Session 负责消息树、压缩与分支；产品 SQLite 负责任务、审批、成果、安装、界面状态。SQLite 中的 messages 展示索引是**可重建投影**，不是原生 Session 的第二编辑入口。UI 的 Fork 请求必须经过 Adapter/Pi 完成，再更新产品映射。

| 存储 | 内容 | 恢复策略 |
|---|---|---|
| SQLite | 产品状态、持久事件、游标、操作意图、资源锁 | 单写入服务、事务、版本迁移、备份 |
| Pi transcript | 原生消息与会话结构 | Adapter 读取/导入，记录 SDK 版本与 leaf/cursor |
| Blob Store | 成果版本、较大日志、附件 | 内容哈希、引用计数、保留期 |
| Package Store | 不可变包版本与投影 | 摘要校验、无副作用的重建 |
| Secret Store | 密钥、授权 token | 系统安全存储；产品库只有 opaque ID |

不要在每个 token 上进行两次同步落盘。流式事件可以按短窗口批次追加，最终消息、审批决定、工具操作意图必须优先持久化。突然断电可能丢失尚未提交的显示片段；恢复以后以最终原生记录为准，不捏造丢失内容。

## 5. 自有协议与事件

具体草案见 `contracts/app-protocol.ts`。所有事件携带 protocolVersion、eventId、threadId、runId、runtimeEpoch、seq、timestamp。seq 在每个 Run 内由 App Server 单调分配；epoch 用于拒绝旧 Worker 消息，seq 不随 Worker 重启归零。Renderer 重连携带 lastSeq，可收到补发事件或 Snapshot。

请求有 requestId 和 idempotencyKey。Run 创建、停止、审批回复是幂等操作；网络调用的业务效果不能因此被称为 exactly-once。出错后仍需按目标 API 能力进行状态查询与对账。

| 自有事件 | 含义 |
|---|---|
| `run.state` | 权威状态变化及原因 |
| `message.delta` / `message.final` | 文本增量与最终内容 |
| `tool.started` / `tool.snapshot` / `tool.finished` | 工具输入、累计输出、结果 |
| `approval.requested` / `approval.resolved` | 宿主授权流程 |
| `artifact.registered` | 已被文件系统/Blob Store 验证的成果 |
| `resources.locked` | 本次启用资源版本与权限指纹 |
| `runtime.diagnostic` | 可展示且已脱敏的错误 |

Pi 当前 RPC 文档中，工具 update 是累计结果，不能重复追加；`agent_end` 不等于所有自动续行结束，另有 `agent_settled` [S03]。这是该文档快照的语义，SDK 适配必须由锁定版本测试验证，不能假定每个历史版本均相同。

## 6. Run 状态机

```text
queued -> starting -> running -> succeeded
                      |   |  -> failed
                      |   +--> waiting_approval -> running
                      |   +--> waiting_input -> running
                      +------> cancelling -> cancelled
进程丢失 / 恢复发现未完成 ----------------> interrupted
```

`waiting_approval` 有超时和到期拒绝；`cancelling` 不立即显示已停止。结算条件是 Adapter 确认自动运行结束、没有待完成宿主工具、没有待审批调用。模型执行失败与用户不满意是不同字段：Run 可执行成功，而 ResultReview 为 rejected。

Cancel 顺序：阻止新调用 → 撤销未发出的宿主任务/排队请求 → 清空 Pi 内部队列（若使用）→ abort → 优雅终止子进程 → 超时强制清理进程组/Job Object → 核验后写终态。已经发送的外部副作用不自动回滚。

## 7. 权限与工具接入

提供自有 `read_file / write_file / edit_file / shell / connector_call / artifact_register` 宿主工具，在 Pi 中注册明确受支持的工具集合；禁用可绕过 Broker 的默认工具、动态加载入口与未经批准扩展。SDK 的 ResourceLoader 是资源接入点 [S02]。

受信任扩展与 Pi 同进程仍能直接调用 Node API。因此“禁用默认工具”只约束模型工具面，不等于约束恶意扩展。公开的可执行扩展必须等隔离后端成熟后才启用。[S07]

## 8. 崩溃恢复与副作用

在外部操作之前持久化 OperationIntent（参数摘要、审批、幂等键），记录 dispatched / confirmed / unknown。重启发现 dispatched 未确认时，先查询目标状态；无法判断就显示“结果未知，请核验”，不能盲目重发。对文件编辑用前置哈希比对与冲突提示，对 Connector 写操作遵守目标 API 的幂等能力。

Worker 不能写产品数据库或 Secret Store。App Server 死亡时 P0 要求 Worker 退出并清理子进程；后续独立 Daemon 模式需增加租约、心跳和认证。不要通过 detached 子进程意外获得无人管理的后台执行。

## 9. 仓库建议

```text
apps/desktop/                 # React + Electron shell
apps/agent-server/            # 产品单体与唯一 SQLite writer
packages/app-protocol/        # DTO/schema，不依赖 Pi
packages/pi-adapter/          # 锁定 SDK、事件归一、契约测试
packages/execution/           # OS backend、PTY、kill tree
packages/policy/              # 审批、能力、审计
packages/package-manager/     # 下载、验证、注册、回滚
packages/skills/              # 解析、筛选、投影、版本锁
packages/connectors/          # 原生/MCP adapter
packages/artifacts/           # 成果索引、预览、导出
packages/ui/                  # 工作台组件
fixtures/pi/ fixtures/security/ fixtures/platform/
```

## 10. MVP 不增加的架构

先不增加 Redis、分布式队列、Kubernetes、自研向量数据库与多租户云控制平面。市场首版可以是签名静态目录加对象存储；本地搜索用结构化筛选与文本索引。所有后续复杂度应由真实并发、授权与同步需求驱动。
