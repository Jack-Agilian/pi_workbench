# 后端交接：运行边界与长历史

## 当前集成状态

2026-09-30按用户授权，`codex/backend-history-safety@feaa3f4` 与前端 `codex/ui-history-artifacts@c0e99c2` 已合入 develop；组合代码 `169df60a51fc1d394d6cc45c335e54eddbc9cef7`。后端从develop@58d3130起步、后来同步e061604的过程是历史，不再将“前端未接入/后端未合并”作为当前状态。实际命令、失败与可测边界见 [集成记录](../validation/ui-p2-merged-2026-09-30.md)。

前端负责产品展示与交互，App Server/Pi adapter/main/preload/HostClient/共享契约仍由可信宿主边界负责；Renderer不读数据库或原生Session文件。此次合并保留两线的已提交代码与证据，不提交两处原有AGENTS.md工作副本修改。

## 必须保持的接口约束

前端已采用 [同一份正式契约](../ssot/backend-history-contract.md)，不复制接口：

1. `historyPage`读正文页，`operationPage`按Run读工具记录，`artifactPage`读真实成果索引。页newest-first，时间线倒序展示，按ID关联；不能退回全量thread再在前端裁剪。
2. `threadActivity`独立提供当前Run和审批；工作区失效明确提示并阻止发送。首屏加载失败时也必须使用活动快照的会话身份/原工作区，不能落到新会话所选目录。
3. 页cursor只用于翻页，snapshotSeq只用于事件补读。首次/重连以各视图最早水位作为共同保守水位；普通事件按实体定向读取，不得以较新活动快照或定向查询水位覆盖已消费事件位置。事件每批最多128条，只推进到实际已消费的最后一条，继续补读；事件不执行工具。
4. 非法cursor从新首屏重新建立已浏览范围并保留草稿，不无限重试同一坏游标。重连刷新首屏/活动快照，不自动重发未确认产品命令；旧请求回调不能进入新会话。
5. preview仍按用户选择核验文件；changed/missing/unavailable保留原登记记录，不伪造成新成果。列表标签表示上次核验时间，不推断当前状态。
6. 离线开发使用 `npm run demo:agent-shell -- --dev-profile=frontend` 或 backend，在各自工作树生成独立profile。真实使用走 `npm run desktop:model` 的单一批准配置与账本，不能复制真实profile制造另一份额度。

## 验证与后续

类型、后端13项、桌面24项及实际模型/Shell/文件的Electron离线链路在组合SHA上通过；总UI套件在集成树两次等待超时、在用户指定前端工作树同一169df60完整通过，另列于集成报告，不覆盖失败或宣称所有环境稳定。本轮真实模型调用0。

R01/R02、后端页预算和Renderer接入已在同一版本。没有虚拟列表、home目录分页或原生全部正文补载，不代表完整UI-P2/Windows/PTY/生产发行通过。当前唯一工作事项以NEXT_STEPS顶部为准；真实人工使用测试与自动测试失败/未覆盖范围分开记录。

F01修正接缝：新增historyEntry(threadId, runId)，字段/归属/字节校验沿用产品边界；正文、工具和成果独立失效，新记录只补头部缺口。整批成功才发布，切换停止后续查询，未知事件/非法页位置显式重同步。详见后端契约F01节；不增加Pi入口或数据库写入者。
