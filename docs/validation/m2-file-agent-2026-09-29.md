# M2-A/B 有限文件 Agent：离线实施与集中验证

日期：2026-09-29。结论：限定离线接缝通过，真实模型工具任务未验收。MODEL-03仅in_progress；M0-Pi保持blocked。

## 基线、代码和输入

- 基线：develop `148022b05250cfda824725778e9a056d00cd6830`，开工时核对origin/develop一致、工作区干净。
- 功能分支：`codex/m2-file-agent`；实际被测代码：`08102d18684affcd7f47e28dc5be8c99dbb013d3`。代码先提交，本文、SSOT及AGENTS是后续文档差异，没有填写未来SHA。
- 平台：macOS 27.0 (26A428)、机器/Node arm64、Rosetta=0；项目Node24.21.0/npm11.19.0、Pi0.87.1、Electron44.4.5。不是Windows/Linux测试。
- 本轮真实模型请求 **0**，未读取/修改真实auth.json或全局Pi目录，未查询endpoint背后服务。旧真实授权4/4及消费不变。
- 固定依赖、唯一锁、声明补丁与初始化逻辑不变。没有安装/下载依赖，A3包测试复用已准备的离线缓存。版本和逐命令退出码/日志摘要见 [持久输入记录](m2-file-agent-inputs.json)。

## 复用与最小增量

Pi公开Session/Runtime、Provider/SSE、原生JSONL、read/write/edit和Operations继续拥有执行语义。ToolDefinition.executionMode='sequential'是公开类型成员；同一轮write/read及后续edit由实际Pi循环处理。宿主编辑预览仅调用公开createEditTool的内存Operations，不自行实现匹配/patch。fauxProvider/fauxToolCall只用于明确SYNTHETIC的桌面驱动；两种OpenAI协议测试使用合成SSE响应，不是真实模型录制。

产品增加SQL v8请求身份/序号及file_operations意图，保留旧请求四列；IPC v6逐HTTP关闭确认和逐工具结果确认；可信宿主的fileTools选项、有限Markdown授权、逐操作核验及既有桌面安全视图。无新RunCoordinator、Provider、第二份消息树或通用RPC。App Server仍是SQLite唯一写入者，Worker不导入ProductCore；旧DB拒读/拒创建和受限进程组回归在本提交重新执行。

实际入口：`npm run test:product-file-agent`、`npm run test:desktop-file-agent`、`npm run demo:file-agent`。后者为可重复运行的明确离线桌面演示；本次程序化执行的是test:desktop-file-agent，而不是人工demo验收。Renderer无法选择测试worker、故障开关或自由工具。

## M2逐项验收范围

| 条件 | 实际结果与范围 |
|---|---|
| 同Run多请求/原生循环 | Chat Completions及Responses各3次合成HTTP：write/read同轮顺序执行，后续edit、最终文本；每次分别预算。每协议再开一个Run，实际重开相同原生Session，保留工具结果；当前Run用量不包含旧Run。 |
| 独立权限与结果 | 每次读取/写入/编辑分别审批、一次领取；重复开始/批准命令幂等。前write成功、后edit失败保持原成功事实；2个写成果与read不混淆。 |
| 有限内容与冲突 | 仅批准workspace相对规范.md、有效UTF-8/无NUL、16000字节；过大读取/编辑结果阻断；资源或版本改变、过期及拒绝审批均不执行。 |
| 预算及时间 | 同Run独立请求身份/序号；v7真实DB迁移原行不变；相同请求重入不追加预留；预算不足不发下一HTTP。审批等待1200ms超过1000ms单请求限制仍可完成两个独立请求；持续每30ms进展的流触及300ms总期限仍停止，非5分钟空闲误判。 |
| 取消与未确认写入 | 领取后实际取消可确认无写入；写入后尚未报告则unknown，真实清理后仅核验原文件/Operation，再结算cancelled，不假称回滚。 |
| Worker和宿主强退 | 实际SIGKILL Worker于领取后/写入后；实际SIGKILL App Server于审批等待/写入后。重新打开真实SQLite，核对guardian exited/groupGone及进程组，恢复仅核验，无重复HTTP/写入；文件mtime保留。 |
| 协议/关闭 | 旧绑定、未知字段、超大消息、未知Provider工具均不能预约预算或文件权限。发现并修正guardian/监督器关闭期间仍可能处理排队消息的问题；下一请求等待旧HTTP关闭ACK，旧read回复不能污染新请求。 |
| 桌面与投影 | 实际Electron/Host/Pi顺序三次审批、3工具卡/2成果；重连游标不变，不执行事件回放；DTO无合成key。后续Assistant流在第一条已持久Assistant旁可见，结束后移除临时片段。 |

Read本身也可能向下一次模型请求披露内容，审批明确数据去向。fileVersion及路径检查不是外部编辑器竞争下的原子CAS；固定进程组/后代测试不证明任意恶意进程隔离。模型模式不开放Bash、PTY、图片、搜索、未知扩展。

## 集中命令和结果

在上述已存在代码SHA上顺序执行23条命令。原始输出位于本机忽略目录 `.artifacts/m2-file-agent-20260929/`；SSOT locator只指向本文和已提交JSON摘要，新克隆可定位，原始本机日志不作为唯一证据。

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | 通过 |
| `npm run test:pi-types` | 通过（10项） |
| `npm run test:pi-probe` | 通过（15项） |
| `npm run test:pi-tools` | 通过（19项） |
| `npm run test:pi-shell` | 通过（4项） |
| `npm run test:pi-resources` | 通过（12项） |
| `npm run test:pi-auth` | 通过（18项） |
| `npm run test:pi-packages` | 通过（8项） |
| `npm run test:product-core` | 通过（20项） |
| `npm run test:product-sdk` | 通过（5项） |
| `npm run test:product-worker` | 通过（51项） |
| `npm run test:product-shell` | 通过（28项） |
| `npm run test:model-integration-offline` | 通过（42项） |
| `npm run test:model-resume` | 通过（11项） |
| `npm run test:model-network` | 通过 |
| `npm run test:model-config` | 通过 |
| `npm run test:product-file-agent` | 通过（30项） |
| `npm run test:desktop` | 通过（19项） |
| `npm run test:desktop-ui` | 通过 |
| `npm run test:desktop-shell` | 通过 |
| `npm run test:desktop-model` | 通过 |
| `npm run test:desktop-file-agent` | 通过 |
| `npm run test:desktop-shutdown` | 通过 |

4条文档检查全部通过，在后续文档差异上单独运行并登记到输入JSON：`.venv/bin/python scripts/check-ssot.py`、`scripts/test-tools.py`、`scripts/check-docs.py --structural-only`、`scripts/check-docs.py --typecheck`。Python沿用仓库.venv；npm/tsc沿用项目PATH。SSOT结构通过不作为模型或平台证据。

## 开发中发现的失败

定向开发检查基于148022b加未提交M2差异，不冒充稳定SHA整套回归。曾发现并处理：

1. 未关闭的排队HTTP：未知字段触发guardian关闭后，下一有效HTTP仍可能转发并预留1次。已在guardian和监督器立即失效连接，修正后该实际Worker用例断言网络/预留均0。完整Worker/Shell/模型/退出回归通过。
2. 测试夹具问题：无待运行Run的测试遗漏可信modelAccess；进程组探测把EPERM误当异常（现按既有规则视为尚未证明退出并继续等ESRCH）；领取后但未写时已有真实clean结果应精确断言cancelled，写后无确认仍断言unknown。
3. 超界路径在Worker本地预检即失败，未创建宿主Operation；Pi可把工具错误交回模型。故意重复错误的合成模型实际4次HTTP耗尽预算，而非原测试假设的1次。最终断言精确4次预留、零成功操作和零越界文件；未把网络失败重试打开，也未削弱权限断言。
4. 添加编辑增长限制：输入片段虽小，预计最终文本可能超16000字节；宿主Pi内存预览与执行Operations均拒绝超限，真实文件保持原字节。

稳定提交后的23条集中命令全部通过，没有失败后掩盖旧结果或重发真实服务请求。秘密模式检查的唯一候选是基线已有、明确SYNTHETIC的桌面测试canary，未新增秘密；未读取真实key来做本次扫描。

## SSOT及停止点

采用入口/evidenceRecords、MODEL-03-A01–A04、契约/配置/开发入口及NEXT_STEPS已同步；MODEL-03从proposed到in_progress，A05无真实证据；M0-UI/M0-SDK原passed不变，M0-Pi仍blocked。唯一当前项是M2-C：先审核离线成果，准备独立真实驱动及新预算/数据/文件范围授权。建议上界8次只是待批准计划，不是授权；不复用耗尽的4/4。

未验证：真实模型自行调用文件工具及其计费、真实10/30分钟长流、Anthropic多工具M2（本轮仅回归其M1零工具）、人工桌面/IME体验、Windows/Linux、任意恶意后代、生产发行、新初始化/新克隆。没有自动合并develop、没有开始PTY/市场/发行。
