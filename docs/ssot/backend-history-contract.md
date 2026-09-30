# 后端运行边界与分页契约

2026-09-30，基于 develop `58d3130d9ed480e283434c749e285efd6ba2092d` 的后端增量。对应该基线审核 R01/R02/R03；本契约不等于前端已经接入分页。

## 复用与最小自有部分

- Pi 0.87.1 继续拥有循环、工具、Session/JSONL、Provider。已安装 SessionManager 声明的 `getBranch(fromId?)`、`getEntries()` 返回原生条目数组，没有本产品 Run/Operation/Artifact 分页入口；本次不另造原生消息树。
- 产品查询继续使用已有 Node SQLite 连接和事务，采用 [SQLite 官方 scrolling window/keyset 查询模式](https://www.sqlite.org/rowvalue.html#scrolling_window_queries)。只增加固定三类查询的 cursor/字节边界，不增加 ORM、分页服务或通用 RPC。
- 开发 profile 使用已有 [Electron app.setPath 与单实例锁](https://www.electronjs.org/docs/latest/api/app) 路径机制；不自建进程注册服务。正式入口语义不变。
- [pi-gui](https://github.com/minghinmatthewlam/pi-gui) 的原生 Session + 轻目录索引/typed IPC 是参考；其完整 SessionDriver 不直接适配本项目 Run/Operation 审计及独立 Worker 授权。已有 Composer 局部移植维持原来源，此次没有复制新社区代码。
- [OpenPi](https://github.com/heyhuynhgiabuu/openpi) 当前 README 已描述 main-supervised sidecar，可作为职责边界参考；未做新模块移植或完整依赖/许可审计。不能沿用旧 README 的 main 直接托管结论。
- Context7 的 Pi v0.87.1 查询同时返回 agent values `readList` 和 main 源码片段；它们不是已安装 coding-agent SessionManager 的产品分页 API，没有据此替换当前数据库或 SDK。

## R01 工作区准入

宿主统一核验当前规范目录与保护集，用于目录选择、旧 Thread 的新 Run、实际派发、工具计划/执行、批准、文件预览和冷恢复对账。保护根缺失、重定向或相交时阻断；历史 Thread 不随新选择重绑。默认受管理 workspace 仅豁免自己的 profile/配置祖先，受保护子目录仍阻断，不能通过显式目录选择取得 profile 内任意路径。

新 Run 被拒绝时返回 `workspace_invalid`。此前已持久化但未派发的 queued Run 写入 `workspace.invalid` 并转 failed，保留原意图/requestId，没有 Worker/副作用，无需伪造清理证明。活动/未知操作仍按原 guardian 证据处理；冷恢复因保护范围变化无法核验文件时保持 blocked/unknown。

原生临时凭据选择先向宿主保护其规范父目录，再读取私有文件；与已有工作区重叠时拒绝。保护根元数据（无 key 值）保存在 profile/host/credential-directories.json，重连/重启沿用；最多16个目录，损坏配置失败关闭。运行中不增改此保护集。该机制不改变已测 OS 限制，也不声称消除任意文件系统 TOCTOU。

Home 的 workspace 条目追加可选 `status: ready | invalid`，供前端显示；ThreadActivity 也返回工作区状态。错误仅通过已知代码传递。

## R02 展示与控制消息

已有 IPC v7 envelope、实际进程通道、binding、64 KiB 消息上限和发送背压继续生效。Worker 的 observation/presentation 使用单调 `observation-N` / `presentation-N` requestId；宿主每类仅保留最近序号，重复/迟到展示不重新应用，也不占控制请求去重缓存。两种前缀保留给对应展示类型，控制消息不得复用；Worker与宿主随同一代码版本启动。原本 modelStream 的合并逻辑继续复用。

有副作用的控制请求仍保存本 Run 的请求/回复，不驱逐旧去重事实；128项是独立的防御性控制缓存，展示不再消耗它。现有产品策略每Run最多16个操作，覆盖16 Bash及混合文件/Bash。Worker接收侧的取消/关闭先于去重额度检查；普通控制回复仍检查相同requestId内容冲突。没有放大队列、无限缓存、恢复4次LLM上限或修改工具许可。

## R03 兼容的 DesktopApi 增量

共享 DTO 位于 `packages/app-contracts/desktop-pages.ts`，方法通过现有 DesktopApi/preload/受限 IPC 暴露：

| 方法 | 返回 | 读取范围 |
|---|---|---|
| `historyEntry(threadId, runId)` | `{item: HistoryItem, snapshotSeq}` | 指定Thread内单Run的同一安全展示投影，只读 |
| `historyPage(threadId, page?)` | `HistoryPage` | Run、输入、既有安全正文投影、模型结果 |
| `operationPage(runId, page?)` | `OperationPage` | 指定Run的工具记录与已脱敏有界结果 |
| `artifactPage(threadId, page?)` | `ArtifactPage` | 真实成果ID、来源Run/Operation、路径、版本、digest/bytes |
| `threadActivity(threadId)` | `ThreadActivity` | 当前活动Run、待处理操作、工作区状态、快照事件序号 |

`page` 只有 `cursor?: string` 和 `limit?: number`。默认16、最大32条，每个完整分页响应最多256000 UTF-8字节；达到字节预算可少于limit。返回 `items / nextCursor / hasMore / snapshotSeq`。单项无法纳入时明确 `page_item_too_large`，不返回空页假称完成。

条目按持久插入顺序从新到旧。cursor是不透明的集合/Thread或Run绑定位置，含首屏插入上界；新增记录不插入正在浏览的旧页链，重复请求不写库或执行工具。非法/跨集合/跨所有者/不存在的位置返回 `page_cursor_invalid`。游标没有访问授权能力，不能指定数据库或文件路径。

**一致性语义**：每页在同一SQLite读取事务中生成，snapshotSeq是该页的当前产品事件序号；cursor不充当事件seq，也不承诺跨多个请求冻结可变Run的旧状态。页链稳定的是插入上界/位置；状态变化从活动快照和 `events(threadId, seq)` 衔接，按实体ID更新已有显示。首次加载/重连先取新首屏与活动快照，分别从其snapshotSeq补读事件；消费完所有128条事件批次后再推进对应事件游标。不要用后读活动快照的seq跳过历史页尚未消费的事件。事件只刷新显示，不执行工具。

读取旧页时仍单独刷新活动快照，不隐藏当前审批。成果列表不批量读文件；用户选中后复用 `preview(artifactId)` 获取 ready/changed/missing/unavailable，列表中的版本是登记版本。

旧 `thread()` 全量接口保留兼容，仍有原响应上限；**前端切换到新方法之前，旧界面的长历史问题仍存在**。本次未引入虚拟列表，未实现原生Session全部正文补载，也未分页home会话目录；不声称支持无限历史规模。

## 开发 profile

```bash
npm run demo:agent-shell -- --dev-profile=backend
npm run demo:agent-shell -- --dev-profile=frontend
```

路径固定在各自工作树 `.artifacts/desktop-profiles/<name>`，name只允许小写字母开头及小写字母/数字/连字符。浏览器userData、Host SQLite、Pi sessions、leases、资源与home/tmp都沿用这一个profile。只允许离线/合成模式；与 `--model`、`--model-config`、smoke选项组合拒绝。正式用户profile和smoke临时profile行为不变。

node_modules/.venv/dist各工作树独立。Node固定可执行文件及已校验的只读下载缓存可复用，不共享可变安装目录、不复制真实模型费用库。GUI检查串行协调；两份Host并发测试不冒充两个完整GUI窗口的人工验收。

## F01 定向刷新补充（2026-09-30）

`history-entry`是本项目产品查询，不是Pi API。仅接受type/threadId/runId，单个有界标识符，不接受路径、SQL、ID数组或执行参数；宿主在同一读取事务核对Run归属，再复用historyPage相同投影。完整响应沿用256000字节预算，超限明确报错。单Run入口避免批量部分成功/拆包协议；多Run变更逐个去重查询，次数随变化实体增长。

Renderer按当前已知事件失效：display.replaced和model结果只读对应已加载Run；run状态同时刷新该Run工具（取消/隔离可直接撤销工具）；approval/operation/shell只刷新对应工具；artifact.recorded只补成果头部。session/observation/model.request_reserved不改变这三类展示。未知事件重新同步全部已读范围，不静默忽略。

新run.queued从首屏补到已知头部，保留旧尾游标；大于一页的新插入不漏项。未加载旧Run的正文变化不会自动装载全部历史。只在整批查询成功后发布新视图并推进到已收到的最后事件；后读snapshotSeq不得跳过128条批次。失败保留完整旧视图和水位；会话切换停止未发出的查询，迟到结果不发布。重连/无效页位置从新首屏重新建立已浏览范围；这些读取不会执行产品命令。

历史R03“前端切换之前”的描述只记录当时阶段；当前Renderer已分页并采用上述定向入口。仍没有home目录分页、虚拟列表或原生完整正文补载。
