# 会话查找与分页：限定验证

## 基线与提交

工作分支`codex/ui-correctness`，基线`750f2662fd16b81e1d01e5eee685cc679fea7507`。

- 功能代码：`40ffc52c2bd77cb757a44cdffcd3178688d28407`。
- 退出来源检查/旧测试定位修正：`58b7442e7686901ec716c12069e95b4a6206d6a9`。
- 本文是后续证据提交，不冒充上述被测代码。

macOS 27.0.1（26A434）、arm64；项目Node 24.21.0、npm 11.19.0、Electron 44.4.5、React 19.3.0、Pi 0.87.1、Query 5.104.0。没有新增依赖/锁文件、SQL迁移或Worker协议版本；仍SQL v13/IPC v12。测试用临时产品库/工作目录和明确合成Provider，**新增真实模型请求0**。

## 本批带来的功能

用户可按名称或工作目录查找全目录会话、筛选项目并加载更多，不受home首32条限制。搜索无结果、读取失败、重连或翻页不丢当前会话、待批操作、停止入口及输入/改名草稿。新建和改名后刷新目录，不把旧游标接入新页链。宿主仍只读产品元数据，原生Session/审批/执行边界不变。

采用映射、排序、大小写、游标、缓存和权限边界详见[契约](../ssot/thread-directory-contract.md)。参考固定pi-gui sidebar行为，复用现有Query/SQLite/产品IPC；未移植完整社区应用或新增Session索引。

## 实际命令与结果

所有npm命令使用项目Node路径。原始stdout、截图与退出码位于忽略目录`.artifacts/thread-directory-20261004/`；下表及本文为新克隆可定位的脱敏摘要。

| 被测代码 | 命令 | 实际结果/范围 |
|---|---|---|
| `40ffc52` | `npm run typecheck` | 通过，严格声明检查 |
| `40ffc52` | `npm run test:backend-history` | 21/21；新增1200条真实SQLite目录、库重开、名称/目录匹配、字节/条数界限、非法/跨过滤/旧游标、无Worker派发 |
| `40ffc52` | `npm run test:desktop` | 43/43，既有来源/协议/查询/确认隔离回归 |
| `40ffc52` | `npm run test:product-core` | 27/27，产品状态/幂等/审批回归 |
| `40ffc52` | `npm run test:product-sdk` | 5/5，实际Pi发行包接入；合成输入，不是模型证据 |
| `40ffc52` | `npm run test:product-worker` | 51/51，真实进程/恢复和固定副作用范围 |
| `40ffc52` | `npm run test:desktop-ui` | 退出0、目录行为断言通过；退出仍记录一次已销毁窗口IPC异常，不能当作无错误完成 |
| `40ffc52` | `npm run test:desktop-agent-shell` | 失败：旧测试选择到新增搜索表单的submit按钮，见下节 |
| `58b7442` | `npm run typecheck` | 通过 |
| `58b7442` | `npm run test:desktop-ui` | 通过；75条真实产品命令建目录、首屏之外中文查找、过滤保留活动/草稿、改名冲突、显式重试、完整页链无重复、迟到过滤及实际Host替换；修正后未再记录上述销毁异常 |
| `58b7442` | `npm run test:desktop-agent-shell` | 通过；真实Bash/独立审批/重连、合成Provider |
| `58b7442` | `npm run test:desktop-file-agent` | 通过；真实write/read/edit与成果、合成Provider |
| `58b7442` | `npm run test:desktop-shell` | allow/deny/cancel通过，合成驱动 |
| `58b7442` | `npm run test:desktop-model` | 离线流/原生恢复/取消/安全错误通过；package脚本明确`--model-offline`，无真实请求 |
| `58b7442` | `npm run test:desktop-shutdown` | 24场景通过；真实退出、强制终止、收据/库恢复、固定后代；不推导任意恶意进程隔离 |

修正提交只改销毁后的来源判断和4个旧桌面测试的输入区选择器，后端/SDK/Worker采用功能提交的实际测试，不将其伪称修正SHA重跑。此前A1–A4发行与平台证据沿用原SHA，本批没有重新执行所有历史独立探针或初始化。

## 失败与修正

1. 未提交开发阶段（基线750f266加本批差异），新SQLite测试误用不存在的`registerWorkspace`/launchCount辅助入口，首次21项中20通过1失败。改用真实`selectWorkspace`/`workerLaunches()`，不削弱“查找不触发执行”的断言。
2. 功能提交的Agent Shell测试使用全局`button[type=submit]`，新增搜索表单后选错按钮。修正为`.composer button[type=submit]`，保留未确认时禁止发送的原断言；相关四套桌面脚本统一改正并全部重跑。
3. 功能提交的UI测试退出时，迟到IPC在来源检查读取已销毁窗口/frame时报错。修正为先检查window/sender销毁，frame访问异常也拒绝请求；没有放宽origin/mainFrame约束。修正后UI与24退出场景通过。

## 可见行为与未覆盖项

真实Electron的1320/820 CSS宽度截图显示过滤无结果时仍保留当前对话、草稿、审批和停止；DOM断言检查搜索、目录、清除、新建与执行控制可达。截图包含合成文本/临时路径，不属于用户人工验收。窄窗、键盘、200%缩放和VoiceOver完整体验仍待最终集中复审；当前搜索表单/展开的新建名称占用侧栏空间仍是复审项。

1200条库测试不能证明无限规模性能。revision标量扫描为O(n)，无删除/归档假设需维护；home仅Thread目录限制为32，workspace/activeRuns未分页。查询为名称/已登记路径子串，ASCII大小写折叠；排序是最近创建，不是最近活跃。没有全文索引、归档、置顶、虚拟化或新的授权能力。合成第二工作目录只验证检索，不声称验证了该fixture的新目录执行准入。

整体目标仍未完成。UI-01/02和ART-01保持in_progress，Gate不扩大；唯一下一批为日常阅读/成果操作，随后按U01–U12做完整工作流复审，不自动合入develop或发布。Skill评估：本批是仍在演进的具体产品设计与接缝测试，不是稳定独立的重复操作流程，本次不新建Skill。

## SSOT 收口检查

上述代码未变、补齐本文及目录契约/计划/采用清单后，实际运行`.venv/bin/python scripts/check-ssot.py`（60通过）、`.venv/bin/python scripts/test-tools.py`（15通过）、`.venv/bin/python scripts/check-docs.py --structural-only`（5通过、0失败、2按结构模式跳过）。这些是文档工作树检查，不充当SDK/平台新增实测。原始日志在同一artifacts目录；docs/startup未修改。
