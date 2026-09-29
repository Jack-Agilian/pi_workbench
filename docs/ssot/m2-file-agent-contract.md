# M2 有限文件 Agent：实施契约

2026-09-29，状态：M2-A/B 运行代码和集中离线验收已完成，**真实模型工具验收尚未通过**。基线 develop `148022b05250cfda824725778e9a056d00cd6830`；实际被测代码及边界见 [M2报告](../validation/m2-file-agent-2026-09-29.md)。唯一当前顺序见 [NEXT_STEPS](../planning/NEXT_STEPS.md)，验收归 MODEL-03。

## 复用与准入

保持 Pi 0.87.1、固定 Node/Electron、现有锁与声明补丁。Pi 负责 Agent Loop、Provider 请求、Session/原生消息树及 read/write/edit 实现。产品只扩展既有 Worker/IPC、预算、逐操作授权/结算与安全展示。没有新任务框架、Provider实现、事件回放执行器或第二份历史。

已通过 Context7 阅读固定版本 [Agent 工具执行说明](https://github.com/earendil-works/pi/blob/v0.87.1/packages/agent/README.md)，并核对安装包公开 ToolDefinition 声明中的 `executionMode?: ToolExecutionMode`。全部选编文件工具设为 `executionMode: 'sequential'`，复用 Pi 的顺序批处理；这是公开类型成员，不是包根运行时导出。同一模型轮返回 write/read 的实际 SDK 合成测试已覆盖顺序执行；另以两种 OpenAI 协议的合成 SSE 覆盖 edit 和后续模型轮。没有真实模型 fixture。

工具模式由可信宿主组合选择，仅批准的 workspace、资源lock和 read/write/edit 可用。旧M1配置仍然零工具；不能因升级自动扩大既有数据/工具授权。Renderer不传worker entry、可执行代码、数据库/凭据路径或自由工具名。真实模式的工具范围和数据范围另行明确批准，旧4/4授权不可续用。

## 已实施接缝

| 原有接缝 | M2实现 | 必须保持 |
|---|---|---|
| ProductCore model_requests 每Run唯一 | 前向迁移为同Run多个宿主产生的请求身份/序号，逐次事务预留；旧行保留全部授权、摘要和费用 | 不退款、不删旧请求、不换授权规避限制；重复IPC不新增消费/网络请求 |
| model-services / model-fetch 单调用门禁 | 仅在批准工具模式允许顺序多调用；每次HTTP拥有独立生命周期、关联身份和关闭结果 | Pi决定是否继续；前一请求清理后才准入下一次，自动重试/压缩/预热仍关闭 |
| WorkerSupervisor 单一预定操作 | 校验动态工具请求的有限产品参数，宿主生成Operation、核对目标/参数摘要/fileVersion/资源lock/绑定/期限 | 不信任Worker自称授权；一操作一批准和一次领取，拒绝/过期/取消后零执行 |
| controlled-tools 的公开Operations | 保留原生工具语义，每个执行独立报告成功/失败/不确定副作用；完成前向宿主确认该操作结算 | 禁止把Run末尾的ok复制到所有Operation；前成功后失败不改写前一事实 |
| 成果与恢复 | 写入前有可对账的宿主意图/文件版本，写入后宿主核实内容摘要并登记成果 | 文件已变但确认丢失只核验，不重复写入；无法证明则unknown/blocked |
| 桌面快照与事件 | 多操作独立审批/状态/成果，有限工具摘要与安全正文 | 仍只传产品DTO；重连/事件补读不执行工具或请求模型 |

模型传输请求只能携带本轮批准工具的公开定义，宿主校验精确工具集合/模式和预算后才出网。不能仅把现有 `tools=[]` 检查删除而接受任意函数、搜索、Shell或Provider端工具。文件操作必须落在批准workspace，继续已有路径/符号链接限制；并注明非原子路径检查的既有边界。read也是独立受控操作。本轮仅相对规范路径的 `.md`、有效UTF-8、无NUL且最多16000字节；读/写及预计编辑结果都受限，最多16处edits。宿主使用公开 `createEditTool` + 内存Operations计算预计摘要，不写真实目标，不重写匹配算法。参数JSON最多18000字节，HTTP输入仍最多24000字节；因此历史/工具内容达到传输限额时会阻断，不承诺任意长文会话。

SQL前向迁移至v8：原model_requests四列原样保留，每Run增加宿主请求ID/序号；新增file_operations只存审批/对账所需意图，不是消息树。IPC v6新增 `file-operation/file-result/file-settled` 与 `model-http-finish/model-http-finished`，是产品消息，非Pi API。每次HTTP关闭确认后才允许下一次；旧read回复仅消耗原请求墓碑，不进入新请求。监督器与guardian在停止开始即屏蔽排队消息。

`fileTools` 必须显式存在于宿主批准的model.json，包含每Run操作上限(1–16)、每Run模型调用上限(1–20)及单操作期限(100–3600000ms)。缺省仍零工具；单纯timeout修订不允许添加/扩大文件工具。总授权maxRequests/费用继续跨Run累计，不会由每Run上限覆盖。

已拒绝、失败或未结算的宿主Operation阻断下一次HTTP；Pi在进入宿主审批前收到参数/路径错误时，可能继续请求模型修正，仍逐次扣预算。超界路径合成测试故意重复错误，准确消耗4次额度后停止，零文件副作用；不把它描述成自动重试网络失败。

## 时间与结束语义

- 单次LLM请求从发起至流结束：默认30分钟总上限，每次新调用独立计时，不在token进展时延长。
- 等响应头或后续非空网络数据：独立5分钟空闲限制；有实际网络进展才重新等待，下游背压不冒充网络空闲。
- Run可能包含多次LLM、多个工具和人工审批。不得沿用M1“一次Run恰好一次LLM”的总计时方式，否则第二个请求会被第一个请求的计时器提前终止。
- 宿主须分别拥有ready、当前模型请求、批准/操作有效期、取消及进程清理的截止。审批期限来自宿主批准记录并在UI可见；等待审批不计为模型网络空闲。已为阶段转换和guardian监督补协议及回归，不让Worker自由延长期限，不把用户确认的30分钟解释成整个Run的新限制。
- Pi正常结束只是输入。Run结算还要逐操作审计、宿主HTTP/文件副作用结算及真实Worker/受管后代清理证据；缺证据不报完成或已取消。

Run外围截止由批准的各阶段预算推导：5000ms启动 + 模型上限×(单请求期限+1000ms) + 操作上限×(单操作期限+1000ms)。每次HTTP仍单独启动总计时，操作期限包含人工等待；取消宽限沿用400ms，guardian沿用外围截止后3000ms。长流采用缩时回归，未做真实10/30分钟服务试验。

每Run一个实际OS进程，关闭/重开复用Pi原生Session引用。App Server是产品SQLite唯一写入者；保持Mac实测OS文件/网络限制与全局单写、同provider单账户。M2不授予Worker数据库权限或直接网络能力。继续保留F01和宿主强退后的孤儿清理回归。

## 集中验收与停止点

已在实际代码SHA执行离线矩阵（命令与失败记录见报告）：零/单/多工具、同一轮多调用、逐次批准/拒绝、版本/资源变化、预算不足阻止下一次HTTP、前成功后失败、审批/执行/流式取消、完成/超时竞争、写入后结果丢失、实际Worker/宿主退出和SQLite重开、原生Session恢复、旧绑定拒绝及安全桌面多操作展示。所有模型输入明确SYNTHETIC，保留真实SDK/文件/进程和合成Provider之间的区分。

统一回归包含既有类型、A1–A4、ProductCore/SDK/Worker、模型、桌面、Shell/退出及SSOT，代码提交先于证据。复用已准备的离线包缓存，没有重新下载/安装依赖；没有重做初始化或新克隆。下一步只准备独立的真实请求数/费用/输出/数据/文件范围计划，失败即停，不把真实服务当调试循环。

MODEL-03-A01至A04有离线SDK/平台限定证据，A05仍缺真实模型证据；MODEL-03保持in_progress，不推进M0-Pi。自由Bash、PTY、未知扩展、更多Provider、OAuth、Windows和发行均不在M2范围。M2完成后停止审核。


## 实机复审补充：2026-09-29

[复审证据](../validation/review-m2-2026-09-29.md) 明确：有效 UTF-8 Markdown 的 BOM 也属于文件字节身份，宿主预演与 Pi 实际输入必须一致；不能把已剥离 BOM 的显示文本用于原字节摘要。已确认清理后，未知 read 不因当前文件已变成超大/非法 UTF-8 而阻塞恢复，结算 failed 不表示它从未读取。write/edit 仍严格核验副作用。M2-C 按 [新授权方案](../planning/M2_C_ACCEPTANCE_PLAN.md) 准备，MODEL-03 与 M0-Pi 不由此晋级。
