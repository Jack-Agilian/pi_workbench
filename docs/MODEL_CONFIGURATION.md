# 模型配置入口

工作台使用两个文件：`model.json` 保存模型、接口与本次发送授权；`auth.json` 保存 API key。默认目录是 `~/Library/Application Support/Pi Workbench/`，不读取或修改全局 `~/.pi/agent`。

Pi 本身也将 key 保存在 `~/.pi/agent/auth.json`，文件初建权限为 0600（仅本人读写）；自定义模型配置放在 `models.json`。见 [Pi 官方凭据说明](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/providers.md)。本仓库核对的是安装的 Pi 0.87.1 文档与公开 SDK。工作台采用其 `api_key` 凭据记录格式，但 `model.json` 是产品授权格式，不能直接当 Pi 的 `models.json` 使用。

当前支持官方 OpenAI Responses、经用户批准的 OpenAI 兼容 Responses/Chat Completions，以及原有 Anthropic Messages。均已做真实 Pi/Worker 的合成响应测试，已限定完成真实无工具文本、原会话恢复及活跃取消；历史超时保留；2026-09-30已补限定真实read/write/Bash项目任务、拒绝、活跃取消与原Session恢复，见文末实测。限定 macOS arm64；没有新增 SDK 或重写 Provider。

## 初始化与填写

使用项目指定 Node/npm。官方 OpenAI：

```bash
npm run model:config -- init-openai
npm run model:config -- init-auth
```

若使用第三方 OpenAI 兼容服务，第一条换成 `npm run model:config -- init-compatible`。所有 init 命令均拒绝覆盖已有文件；已有文件直接编辑。`init` 仍可创建通用占位模板。也可在命令最后指定仓库外目标路径。

`auth.json` 内容如下，在本机编辑器中填入实际 key：

```json
{
  "openai": { "type": "api_key", "key": "" }
}
```

key 是明文保存，权限必须为 0600；不要放入聊天、Git、`model.json` 或命令参数。这里只接受字面量 key，不运行 Pi 可支持的 `!命令`，不解析环境变量，也不接受 OAuth 记录。启动和宿主重连时，批准的配置会读取其同目录 `auth.json`；修改后重启。缺失、空 key 或权限不合格时保持“需要凭据”。

`model.json` 由初始化命令生成，填写以下内容：

| 字段 | 含义 |
|---|---|
| provider / model | OpenAI 接口填 openai，model 填服务商的精确模型 ID；没有默认真实模型 |
| endpoint | Base URL，包含服务商要求的路径，例如官方 https://api.openai.com/v1；不追加 /responses 或 /chat/completions |
| approved | 初始 false；核对服务和允许发送的数据后再由你改为 true |
| dataScope | 本阶段固定 synthetic_non_sensitive，仅发送合成无敏感材料 |
| maxOutputTokens | 可选覆盖；产品模板省略，沿用 Pi 的模型输出默认值，不默认限制512 token |
| httpIdleTimeoutMs | 等响应头或后续网络数据时的空闲上限；新模板 300000（5 分钟），持续有数据不按累计时间触发 |
| timeoutMs | 同一个 LLM 请求的独立总上限（等待响应及生成都计入）；新模板 1800000（30 分钟），可配置到 86400000（24 小时）；这是API总超时检测，不是用量预算或Pi空闲默认值 |
| maxEstimatedCostUsd | 可选；缺省/null不设费用上限，产品模板不生成；显式数字兼容有限验证 |
| authorizationId | 本次授权身份；重开不重置，不应为了绕过限额修改 |
| openai | 可选兼容接口声明，见下方；官方发行目录模型一般不需要 |

已在 Pi 0.87.1 目录中的 OpenAI 模型（含 gpt-6-luna）不必填写 `openai`；配置的 endpoint 可通过 Pi 公开 baseUrl 覆盖入口使用，能力与价格仍来自 Pi 目录。只有目录之外的自定义模型或需要改变协议时，才填写 `openai`，例如：

```json
"openai": {
  "api": "chat-completions",
  "contextWindow": 8192,
  "maxTokens": 8192,
  "inputUsdPerMillion": 0.2,
  "outputUsdPerMillion": 0.4,
  "tokenLimitField": "max_tokens"
}
```

上述数字仅演示字段，不是任一服务商的真实价格。初始化兼容模板的数值为 0，必须按服务商资料填写才能通过检查；价格要求正数，可填写保守上界。新式 Chat Completions 服务可能要求 `max_completion_tokens`；Responses 使用 `api: "responses"` 并删除 `tokenLimitField`。不自动尝试其他接口或切换模型。缺省仅文本、零工具；M2文件模式须显式批准，见文末。不开放自定义请求头、任意参数或可执行代码。

```bash
npm run model:config -- check
npm run desktop:model
```

check 不发模型请求，不读取 key 或远端目录；显示当前配置限制，不推算剩余额度或可支付次数。后台仍记录请求身份与用量，估算不是服务商账单；不以估算余额阻挡缺省配置的功能使用。

自定义路径：`npm run model:config -- check /absolute/path/model.json`；启动使用 `npm run desktop:model -- --model-config=/absolute/path/model.json`，凭据仍取同目录 `auth.json`。

## 桌面与凭据边界

Renderer 只收到就绪状态，不接收 key、路径或 Pi 对象。宿主通过已有私有通道将内存 key 交给 Pi 公开 `ModelRuntime.setRuntimeApiKey`；不会把 key 写进产品库、原生 Session 或日志。不声称内存物理擦除、Keychain 或 OAuth 已实现。

原有“选择凭据”仍可临时加载仓库外、权限 0600 的纯文本 `.key` 文件。此操作不修改 `auth.json`；重连后会重新读持久配置，临时 key 不保留。文件路径不能由页面指定。

`approved=false`、配置无效或无有效凭据时不能发送。启用后按“新建会话 → 发送合成文本 → 同一会话继续 → 停止”验证；原生上下文由 Pi 保存，每次发送一次Run；未启用fileTools时没有文件或Shell工具。停止不承诺撤销服务商费用。

## 离线检查

```bash
npm run test:model-integration-offline
npm run test:model-network
npm run test:model-config
npm run test:desktop-model
npm run test:desktop
```

覆盖真实 SDK/进程的合成 SSE、固定本机 HTTP/OS 禁网、配置和持久凭据、真实 Electron 会话操作。凭据测试使用合成 key、临时目录和宿主禁网；程序化原生 dialog 测试不冒充人工验收。

完整边界见 [M1 契约](ssot/m1-model-contract.md) 和 [当前配置规则](ssot/model-limits-contract.md)。当前已授权的合成项目继续验证；无需填写请求次数或费用预算，也不再按剩余额度规划。更换账户、端点或扩大数据/工具权限仍须明确配置。

## 历史 M1 验收驱动（非日常启动入口）

以下驱动为早期有限验收保留，只约束其固定测试场景；它们的计划、次数和有限配置检查不适用于普通桌面使用。日常入口是 `npm run desktop:model`。

关闭其他工作台窗口后，确认本机配置已授权，可运行 `npm run validate:model-live -- --execute-approved`。该入口会发送至多三条合成文本到真实服务：短文本、宿主重连后原生上下文继续、观察流式正文后取消。它使用正常 model-profile 产品库记录用量；仅对显式有限的旧配置检查门槛，不为缺省配置添加额度。一次授权只自动执行一轮；重复运行须先检查持久验收报告，不自动重试失败。此命令不属于自动测试套件，裸运行不会读取凭据或发请求。

## 原授权时间修订与历史续验

先关闭其他桌面窗口和模型驱动器。保留原配置的字节顺序作为 `previous.json`，另存候选 `candidate.json`，只改 timeoutMs 和/或 httpIdleTimeoutMs。Pi 0.87.1 的 HTTP 空闲默认值为 300000ms；本应用的新模板将它用于独立空闲字段，总请求上限另设为1800000ms（产品默认，可调整）。同一个请求持续输出10分钟不会仅因超过5分钟而终止。自动重试仍关闭，旧配置不会自动改写。

```bash
npm run model:policy -- check /path/to/previous.json /path/to/candidate.json revision-id
# 用户明确批准 timeout 修订后；保留同一授权累计预算
npm run model:policy -- apply-approved /path/to/previous.json /path/to/candidate.json revision-id
```

此入口只写产品策略修订记录，不覆盖 model.json。完成修订后将批准的候选配置保存为应用 model.json，重启/重连应用。若旧摘要无法由 previous.json 证明，拒绝修订；不要删除账本、换授权 ID 或修改旧请求记录。当前已取消用量门槛；仍持有有限旧配置时，可使用本文末尾已批准的额度移除修订，不能删除历史记录绕过策略一致性。

```bash
# 当前配置、原报告与实际产品账本必须一致；准备阶段不读 key、不联网
npm run validate:model-resume -- prepare attempt-id
# 审核计划后显式执行，只补恢复和活跃取消，最多两次，失败即停
npm run validate:model-resume -- execute-approved attempt-id
```

计划与追加结果保存在原 model-profile；原首轮报告保留。已经执行或中断的 attempt 不会重跑；不得删结果文件绕过门禁。仅显式有限旧配置可能因历史驱动的用量检查而准备失败；当前缺省配置不估算剩余额度。本入口限定 macOS，仍使用应用专用 auth.json 与原 HostClient/Worker 链路。

### 单个长流式请求的时间语义

2026-09-29 已获用户确认：新配置默认单个LLM请求总上限30分钟，独立网络空闲上限5分钟。这不增加累计请求数/费用授权，也不自动改写旧配置。

httpIdleTimeoutMs 测量宿主等待响应头或下一段非空网络数据的时间。收到数据后，下一次等待重新计时；HTTP/SSE 心跳和思考事件等网络数据也属于进展，不以 UI 是否显示新 token 为准，不另写 SSE 解析器。下游背压暂停读取时不冒充网络空闲；总期限仍限制整个执行。

timeoutMs 是另一个独立限制：从单次请求开始等待到最终生成都受它约束，宿主从派发计时加5秒启动余量。持续生成仍可能触及这个显式总上限；如果需要更长生成，应明确调整该字段，而不是增加空闲超时。Worker ready 5秒、取消及清理期限独立保留。

历史配置没有 httpIdleTimeoutMs 时，以原 timeoutMs 作为空闲兼容值，同时保留原总上限；不静默延长已有授权。历史M1验证时已用完4/4的配置当时保留原值；2026-09-30取消次数上限后，通过本文末节的独立修订移除次数限制。变更任一时间字段都需明确策略修订，次数/预留继续累计，不能为长生成重置账本。


续验入口在读取凭据/启动宿主前检查已开始的 attempt 与现有锁：`resume_attempt_already_started` 要求查看原结果及产品账本；`resume_validation_locked` 表示另一个或中断的驱动器占用该 profile。不要删结果、自动抢锁或重发请求。先核实原驱动器和宿主是否仍运行；若已退出，用正常宿主恢复对账并保留原失败/中断记录，再决定后续明确授权。自动化不提供强制解锁/自动续跑。

## 文件工具配置

可选字段 `fileTools` 是宿主授权策略，缺省仍零工具。它不是Renderer参数，也不是Pi的自由配置。批准工作目录与文件访问后在model.json显式加入，例如：

```json
"fileTools": {
  "operationTimeoutMs": 300000
}
```

maxOperations缺省/null不限制每Run操作次数；显式数字仅兼容有限测试，maxModelRequests默认不填写，每Run续轮次数不限；1–20仅保留有限模式，null亦表示不限；顶层maxRequests默认也不填写，累计次数不限，历史费用估算继续按整个授权跨Run记录，只有显式费用上限才阻断。operationTimeoutMs范围100–3600000ms，包含逐操作人工等待及执行，审批页显示截止。模型请求总期限每次独立计时，等待审批不消耗HTTP空闲期限；Run外围期限在有限模式按次数推导；次数不限但显式设置费用上限时兼容原外围包络；两者均不限时不设整Run截止，仍保留逐请求、逐操作及阶段切换监督，详见 [契约](ssot/m2-file-agent-contract.md)。

文件目标仅宿主批准workspace中的规范 `.md`；Adapter将该目录内的绝对路径转成相对路径后再计算审批摘要，目录外仍拒绝。文件要求，有效UTF-8、无NUL、最多16000字节；read也必须审批。批准绑定目标、参数、原版本、资源lock、Run身份及期限。文件正文/工具结果可能进入后续模型请求，因此仍只允许合成无敏感材料。Bash、任意Provider工具、图片及未知扩展均未启用。HTTP输入24000字节上限仍保留，达到上限即阻断。

不能通过仅修改timeout的修订添加fileTools；工具启用使用独立tools修订，原用量记录继续保留。当前已批准目录与工具的验证按 [唯一计划](planning/NEXT_STEPS.md) 推进，不再要求4/8次或累计费用门槛。M1的validate:model-live/resume脚本不是M2验收驱动；M2自动检查只运行test:product-file-agent和test:desktop-file-agent。交互演示运行demo:file-agent，始终明确标记SYNTHETIC。


## 显式启用受限Bash（Agent Shell）

已有fileTools的配置可显式启用以下Bash策略；缺省不开放Bash。单LLM的30分钟是API总超时检测，不是命令时间限制。

```json
"shellTools": {
  "profile": "restricted-bash-v1"
}
```

这是启用Bash的字段片段，不是完整配置。默认无Bash次数或命令独立超时；模型显式传入timeout时仍按该命令参数执行。maxCommands、timeoutMs的显式值仅供可选有限配置/测试；操作审批及执行有效期仍来自fileTools.operationTimeoutMs，并在界面显示。Bash会读写批准workspace任意类型文件；每条命令显示实际cwd/文本/期限并单独批准，结果可能发给配置的模型端点。其网络与环境仍受Mac profile限制。只修订timeout的model:policy命令不能添加该权限。实际使用与范围见 [Agent Shell契约](ssot/agent-shell-contract.md)。2026-10-03已登记并应用本机额度移除，未改变工具权限；配置维护未读取凭据或调用模型，另外执行的真实验证单独记录。


## 不限制请求次数

2026-09-30用户明确“不限制llm请求的数量”。产品模板不生成maxRequests，也不要求用户配置请求次数；缺省即不限次数。4次/8次等测试限制只在历史兼容字段和明确标记SYNTHETIC的测试配置/旧验收驱动中保留，不是产品默认。已有配置通过显式修订，保留authorizationId、全部请求/预留记录、费用/输出/数据范围。工具模式同样默认不配置fileTools.maxModelRequests；null兼容表示不限次数。不使用0、极大整数或字符串假装无限。没有fileTools时不会自动添加工具权限。

授权累计次数和每Run续轮均可以不限，但每次HTTP仍由宿主预留费用、绑定身份并持久记账。显式有限配置的费用不足，以及取消、操作拒绝、未知副作用和期限仍会阻断。30分钟单LLM总期限、5分钟网络空闲独立于次数；费用上限是独立可选项；不限次数/费用均不启用自动重试。

已有配置须在应用关闭、无活动/unknown Run时保留原文件，再制作仅移除这两个次数字段的候选文件，运行：

```bash
npm run model:policy -- check-requests previous.json candidate.json request-count-approved
npm run model:policy -- apply-approved-requests previous.json candidate.json request-count-approved
```

完成后将candidate保存为应用model.json再重启。修订命令只登记策略，不覆盖配置，也不读auth.json、不调用模型；同revision-id幂等。旧check/apply-approved仍仅允许期限修订，不能借它解除次数或新增工具；请求次数修订也不能改费用、身份、期限或工具权限。改期限另作一次已批准的期限修订。历史文件验收方案固定8次/每Run4次，驱动继续拒绝不限次数配置，不能把它冒充当前Agent Shell任务入口。

[次数缺省、本机期限修订与限定离线回归证据](validation/request-defaults-2026-09-30.md)。


## 已批准的工具范围修订

工具启用与LLM次数/费用是独立边界。已有授权需要启用文件/Bash时，不换authorizationId或重建profile；先制作只含已批准fileTools/shellTools变化的candidate，再执行 `model:policy check-tools` / `model:policy apply-approved-tools`，参数仍为previous.json、candidate.json、revision-id。修订保留原请求、费用、模型、期限和数据范围，禁止夹带LLM次数变化；完成登记后保存candidate为model.json。Renderer不能调用此维护入口。

2026-09-30本机已启用批准的工具范围并用专用合成项目通过真实验收；不要求重新填写请求次数。独立手动入口 `npm run validate:agent-shell -- --execute-approved <attempt-id> <approved-synthetic-workspace>` 复用现有产品链路，逐操作终端审批；它是验收驱动，不是产品启动默认行为，正常使用仍是 `npm run desktop:model`。详见 [实测范围](validation/agent-task-live-2026-09-30.md)。


## 不限制费用（2026-10-03）

用户已明确取消真实使用的费用预算门槛，后续不推算余额/剩余调用次数，优先调通完整功能。新模板默认省略 `maxEstimatedCostUsd`；已有配置只删除该字段或改为null，需登记显式修订，保留原授权身份与全部用量记录。早期累计$1及4/8次只属于历史验证范围。安全边界和当前各类限制见 [产品限制契约](ssot/model-limits-contract.md)。

```bash
npm run model:policy -- check-cost previous.json candidate.json approved-cost-change
npm run model:policy -- apply-approved-cost previous.json candidate.json approved-cost-change
```

关闭当前桌面后操作；candidate仅取消费用上限，登记成功再保存为应用model.json并重启。命令不读密钥、不调用模型；不能夹带输出/时间/工具权限变更。测试仍可显式设置有限费用以验证拒绝行为；不把这类测试值加入产品默认。


2026-10-03追加决定：512输出token、8个操作、6条Bash、每条30秒以及4/8次和累计$1均从产品模板及当前使用配置删除。`apply-approved-usage-defaults` 可以一次登记仅删除这些字段的变更，保留同一授权、模型、API超时、工作目录、工具启用和原账本。有限值仅保留在明确的合成测试/旧配置兼容中，不应把示例测试值复制进日常配置。Pi目录外自定义模型如无输出覆盖，需要填写 `openai.maxTokens` 声明模型能力（不是人为的小额度）；目录内模型直接用Pi元数据。
