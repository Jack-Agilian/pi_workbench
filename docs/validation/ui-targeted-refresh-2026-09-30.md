# F01 定向刷新与 F02 复用依据修正

2026-09-30。基线为已集成 develop `96768a6293838f5c56395a5f1689672018bb1e28`；本轮开工实际fetch确认未前进。功能分支 `codex/ui-targeted-refresh`，被测代码提交 **e7764e46df3cb8bc3fcdcddc992246ebccfde95c**。后续文档提交只登记结果；原有未提交AGENTS.md保留，不纳入本轮提交。当前工作树是用户指定的worktrees/develop，并非凭目录名假定分支为develop。

## 带来的变化

浏览较多旧记录时，新回复只查询发生变化的正文，工具和成果各自刷新；审批与停止继续走独立活动快照。新记录超过一页仍补齐，读取中途失败保留原完整画面，切换会话后不再继续发送旧会话的后续查询。重连保留已浏览深度与草稿，不重发工具命令。

复用已有Pi SDK/Worker、SQLite只读事务、产品安全投影、keyset分页、Electron IPC、React组件和滚动控制。只增加单Run `historyEntry`产品接缝、有限事件失效表、批次提交和切换代际保护；没有新依赖、缓存库、ORM、原生Session副本、虚拟列表或Provider修改。run状态变化会同时刷新该Run工具，因为取消/隔离会撤销工具而不一定产生独立operation事件。

## 查询量与一致性

| 合成已加载历史 | 原实现单次正文更新 | 当前实现 | 未变化旧历史/工具/成果 |
|---|---:|---:|---|
| 64 | 74 | 2 | 0次查询 |
| 256 | 290 | 2 | 0次查询 |

口径为真实ThreadPages模块+明确SYNTHETIC端口的方法调用计数，当前是events=1、historyEntry=1；不是IPC耗时、模型请求或费用，不包含独立home/threadActivity轮询。原96768a6反例在前序复审重新运行；本轮断言位于thread-pages.test.ts，同Run重复事件只读一次。多变化Run按实体数读取，不承诺固定两次处理所有批量变化。

事件分类未知时重读已加载范围；重连也重读，不能将上述两次目标扩大到全部情况。坏页游标只做一次首屏重同步，重同步失败仍报错；整批成功才发布和推进到实际收到的最后事件，后读页面水位不会跳过128事件批次。单Run查询严格验证字段、标识符及Thread归属，响应限制256000字节，无路径/SQL/执行参数。

## 实际命令与结果

平台为macOS27.0/26A428 arm64，项目Node24.21.0、Electron44.4.5、Pi0.87.1，锁与声明补丁不变。使用项目Node/Python环境，测试驱动继续隔离临时profile与凭据。真实模型调用 **0**，未读取或改写真实模型配置/账本。可定位的命令、退出码、耗时、原始日志摘要见[输入记录](ui-targeted-refresh-inputs-2026-09-30.json)；原始输出位于忽略目录`.artifacts/ui-targeted-refresh/`，SSOT引用本报告而非忽略文件。

| 命令 | 结果与范围 |
|---|---|
| `npm run typecheck` | 退出0，严格声明补丁核对及类型检查 |
| `npm run test:desktop` | 32/32；含12项分页读取检查，8项为本轮新增合成查询/故障回归 |
| `npm run test:backend-history` | 15/15；实际SQLite/HostClient跨进程查询、归属隔离、重连、原边界回归 |
| `npm run test:product-core` | 20/20，产品状态/幂等/清理原断言 |
| `npm run test:product-sdk` | 5/5，既有真实Pi接缝及合成事件投影 |
| `npm run test:desktop-ui` | 退出0；三尺寸截图/布局、旧页锚点、正文定向更新、草稿/焦点、工具分页、按需成果预览、60→61条持久历史、实际Worker审批/取消/宿主重连及原确认丢失/关闭失败 |
| `npm run test:desktop-agent-shell` | 退出0，实际Electron/Pi工具/受限Bash，合成Provider |
| `npm run test:desktop-file-agent` | 退出0，实际Electron/Pi文件工具，合成Provider |
| `npm run test:desktop-model` | 退出0，实际Electron/Pi无工具会话，合成Provider |

项目`.venv/bin/python`执行：`scripts/check-ssot.py` 60/60、`scripts/test-tools.py` 15/15、`scripts/check-docs.py --structural-only` 5通过/2跳过、`scripts/check-docs.py --typecheck` 7/7。检查基于e7764e4代码加本报告/SSOT文档修改，不把后续文档状态冒充代码提交原有内容。

GUI命令串行执行。test:desktop-ui在提交前工作副本与e7764e4各通过一次；其余表格结果指e7764e4。布局截图/几何原始记录在`.artifacts/ui-layout/`，人工查看820×640截图，审批、停止及输入区可见。后台与GUI命令可同时运行，各自隔离profile；不声明全部负载环境稳定。

## 失败、历史超时与未覆盖

提交前初次typecheck发现可擦除TypeScript模式不允许参数属性、合成Operation漏artifactPath，已修正；首次backend-history为14/15，唯一失败是测试直接比较SQLite无原型行与IPC普通JSON对象。现在比较同一JSON传输形态，所有字段/归属/水位断言保留，未放宽产品校验。这些工作副本失败日志保留，不冒充已有提交的测试。

旧169df60在另一个集成工作树的两次120秒UI超时仍是未定位历史问题。本轮当前工作树未复现；新增无秘密的步骤日志，以及绘制帧/几何查询/截图各8秒测试阶段界限，总120秒不变，没有跳过截图或弱化锚点断言。这是可诊断性改进，不能声称已确定或修复历史根因；未到另一工作树覆盖其用户修改或重跑。

本轮未重跑全部A1–A4、完整退出矩阵/Windows，不新增真实模型桌面人工体验、home分页、原生完整正文、DOM虚拟化或生产发行证据。当前首次/未知事件/重连仍随已加载范围增长，浏览越多DOM/内存越大。

## F02 与状态维护

[固定上游P16](../ssot/upstream-evidence.md)已有SQLite/JSONL存储与恢复，旧“当前仅内存”理由纠正为历史。源码0.99.1不冒充registry发行验证；仍Experimental，未安装、导入或完成产品兼容测试，durable保持evaluate。后续采用门槛包括原生Session迁移、审批一次领取、进程清理、未知副作用和预算，不能仅凭README替换ProductCore。

reuse-map采用说明/evidenceRecords、backend-history-contract、前后端交接、backlog和NEXT_STEPS同步。UI-01/UI-02/ART-01继续in_progress，M0三个Gate沿用既有有限范围，不因查询次数通过而晋级。当前唯一事项为本修正的交付复审与develop集成准备；之后才进行同一真实profile的完整人工使用检查，本轮不自动合并或调用模型。

Skill评估：此次工作包含产品事件分类和上游适配判断，不是已稳定的重复操作流程，不新增Skill。可重复部分直接保留在现有单元/IPC/Electron测试命令中；此前Context7 resolve→query文档核对流程没有变化。
