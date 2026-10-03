# Pi 错误展示与社区优先规则：限定验证

日期：2026-10-03。基线 `ad92df2f295266bede18c3c33ed2a29ff4d39545`，功能分支 `codex/model-error-diagnostics`。实际代码提交 **`0393f5712c654e2c33501c8a8efada68eb5a4b36`**；随后仅修正 Electron 测试等待条件的提交 **`18507248a8f5fcb7a58531ff580b060c625fc5d8`**。本报告/SSOT是后续文档差异，不冒充被测代码。远端 develop 开工读回为上述基线，没有回退历史。

平台：macOS 27.0.1（26A434）、arm64，Node 24.21.0 arm64，Pi 0.87.1 / Electron 44.4.5。没有新增依赖、修改锁/发行声明补丁/初始化、访问用户 auth.json、修改真实配置/账本或调用真实模型。模型输入全部 SYNTHETIC；运行器使用受管理临时目录、白名单环境和网络限制。model-network 另含实际本机 loopback 与 OS 权限检查，不访问外部模型。

## 本轮用户可见变化

失败回答旁显示真实 HTTP 状态、已识别上游错误码和对应中文说明；HTTP 403 无已知代码时只说明服务拒绝请求，不猜具体权限或账户原因。流式失败也有安全摘要。旧记录没有详情则明确标注未保存，不能回补历史 401/403 原因。不会自动重试失败请求。

AGENTS.md 新增“功能实施前先查社区实现”：先读现有映射和实现，再查 Pi/相关社区，核实固定发行版/API/许可，记录模块、参考入口、采用范围、保留边界与拒绝原因。保留开工前 AGENTS 已有的末段删除；未覆盖其他工作树未提交内容。规则将社区核对放在编码前，也要求集中离线回归与真实模型验收分开。

## 复用与安全范围

[采用契约/ADR](../ssot/model-error-contract.md)记录官方固定提交、公开入口以及最小例外。Pi 继续负责 HTTP/SSE 解析、Agent Loop、事件结果与原生 Session；没有复制 TUI 组件或创建新的 Provider 解析器。新增仅为宿主有界错误字段提取、适配层错误元数据投影、闭合 DTO 和桌面说明。公开错误帮助函数不会脱敏，不能直接将任意正文传给 UI 或写入原生历史。

非 2xx 最多检查16 KiB/1秒（空闲期限更短时沿用较短值），只保留有限已知 code；HTTP status 单独保留。未知代码、正文、头部详情、param/debug、HTML、超大或非法 JSON 不透传。成功 HTTP 中的 SSE 仍交给 Pi，适配层清除自由错误文本、diagnostics/rawStopReason 后才交付 Session。已知代码识别针对当前0.87.1错误格式，升级需接缝回归；不承诺涵盖所有上游错误码或识别回答正文中的任意语义秘密。

产品 Outcome 增加可选 error；旧 SQLite JSON 无需迁移，Worker IPC v8 拒绝旧版本混用。错误观察不改变清理、审批、费用预留或结算所有权。AssistantMessageEventStream 类只用于合成故障测试，产品采用公开工厂；没有 experimental/deep-import。

## 实际运行命令和结果

下表前两组在 `0393f5712c654e2c33501c8a8efada68eb5a4b36` 执行；第三组在 `18507248a8f5fcb7a58531ff580b060c625fc5d8` 执行，该提交只调整测试等待新会话的条件。所有成功命令 exit 0。

| 命令 | 实际结果/范围 |
|---|---|
| `npm run typecheck` | 严格类型与既有 Pi 声明补丁校验通过 |
| `npm run test:model-integration-offline` | 64/64，含7个 HTTP/SSE 错误真实Worker/原生历史/数据库重开场景，9个有界HTTP错误读取/取消场景，3个公开Pi容器与合成故障检查 |
| `npm run test:desktop` | 39/39，旧DTO、代码/状态说明、拒绝任意错误文本；原分页/查询/宿主回归 |
| `npm run test:product-worker` | 51/51，IPC v8、真实进程监督、审批、崩溃恢复 |
| `npm run test:product-file-agent` | 34/34，实际Pi文件工具与合成模型 |
| `npm run test:product-model-shell` | 20/20，实际受限Bash与合成模型 |
| `npm run test:model-network` | 实际loopback、重定向拒绝、Worker数据库/网络隔离通过；真实模型0 |
| `npm run test:pi-probe` / `test:pi-tools` / `test:pi-shell` | 15/15、19/19、4/4 |
| `npm run test:pi-resources` / `test:pi-auth` | 12/12、18/18 |
| `npm run test:product-core` / `test:product-sdk` / `test:backend-history` | 20/20、5/5、15/15 |
| `npm run typecheck`（测试等待修正后） | 通过 |
| `npm run test:desktop-model`（修正后） | 实际Electron合成流、原会话恢复、活跃取消及新增安全错误提示通过；Renderer无Pi/宿主导入 |
| `npm run test:desktop-agent-shell` | 实际Electron目录/逐操作审批/非零退出后续操作、真实Bash、三尺寸截图与重连不重放通过；模型合成 |
| `npm run test:desktop-ui` | 实际Electron原有工作台/分页/查询/审批/停止/退出场景通过；无真实模型 |

文档差异上另运行 `.venv/bin/python scripts/check-ssot.py`（60/60）、`.venv/bin/python scripts/test-tools.py`（15/15）、`.venv/bin/python scripts/check-docs.py --structural-only`（5通过/2跳过）、`.venv/bin/python scripts/check-docs.py --typecheck`（7通过/0跳过）及 `git diff --check`，全部通过。完整示例类型检查不等于新的模型或平台验收。

新增持久化检查先用合成成功响应建立原生 Session，再制造 HTTP 401/403/429、未知HTTP代码、SSE error/response.failed/未知代码。断言失败态、最多原定两次合成请求、无工具、原生错误已保存、明文及编码反射 canary 未进入原生历史/SQLite/展示/启动日志；关闭后重开真实数据库，结果一致且不重发。不是仅在首次 Assistant 未落盘时检查文件不存在。

## 失败和未覆盖范围

`0393f57` 上首次 `test:desktop-model` 在 `error-send` 超时：新增场景只等待输入框可用，没有等待新Thread切换，填写落到旧Thread草稿。`1850724` 改为等待两个会话、空历史和可用输入框后填写；原错误展示断言保留，重跑通过。该首轮失败单独登记，未修改产品实现或延长测试超时。

提交前类型检查曾发现测试误取 HistoryEntry.modelOutcome（正确为 item.modelOutcome）和给 fauxAssistantMessage 传入非公开 rawStopReason 选项；已分别使用产品实际结构及返回对象的公开类型字段修正，无 any/ts-ignore。它们发生在基线加工作区差异上，不记成上述已提交代码失败。

首次 Git HTTP/2 只读查询发生 framing error；同一认证下仅命令级 HTTP/1.1 重读成功，没有改全局 Git/账户配置。

没有真实模型请求、没有用户人工体验、Windows/Linux 实机、生产发行、任意恶意进程或任意敏感正文脱敏证明。没有重跑安装/新克隆初始化、包来源探针与完整退出矩阵；依赖/初始化未改，不能沿用历史报告声称本轮重跑。旧401/403根因仍未知；本次安全诊断不能恢复已丢弃的历史正文。

原始输出位于 `.artifacts/model-error-2026-10-03/`（含首轮失败与最终日志）；本文件及同目录[命令摘要](model-errors-inputs-2026-10-03.json)为可随新克隆定位的脱敏证据。SSOT采用入口、evidenceRecords、backlog 与 NEXT_STEPS 同步；UI-01/02保持in_progress，既有Gate不晋级。唯一下一步仍是集中真实桌面工具/审批/取消/恢复使用检查。

Skill评估：本轮核对仍依赖具体模块与产品边界判断，不创建泛化操作Skill；已将稳定的“先查再实施”要求写入AGENTS并复核Context7流程适用。
