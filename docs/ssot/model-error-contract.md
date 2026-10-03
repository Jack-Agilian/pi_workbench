# 模型错误的安全展示（2026-10-03）

## 先查实现，再限定差异

所选发行版保持 Pi 0.87.1；官方 v0.87.1 对应 `f07218c4d4bbc12bef056a7058c3dd49dfe41abe`。Context7 检索结果部分指向 main，只作定位；公开入口以已安装发行包 exports、声明、实际 ESM import 和离线接缝为准。

| 本项目模块 | 参考文件/API | 借鉴或替换范围 | 保留边界 |
|---|---|---|---|
| model-services / model-errors | pi-ai 公开 `Provider.streamSimple`、`utils/error-body` 的 `normalizeProviderError` / `formatProviderError`、`utils/event-stream` 的 `createAssistantMessageEventStream` | 委托原 Provider 解析 HTTP/SSE；复用事件容器与格式化函数，在原生 Session 保存之前收敛错误元数据 | 不重写协议、Agent Loop、原生历史；Provider 是类型/实例入口，不是根级函数；两个 utils 是公开子路径，不是 deep-import |
| model-http | Pi OpenAI Responses 的公开 fetch 注入；官方 `packages/ai/src/api/openai-responses.ts` / `openai-responses-shared.ts` 行为 | 保留失败响应的真实状态和已识别代码；不依赖只在成功响应后触发的 onResponse | 宿主拥有网络、预算与取消；不解析 SSE，不扩大目标地址/凭据权限 |
| run-history | 官方 `packages/coding-agent/src/modes/interactive/components/assistant-message.ts` 的 stopReason/errorMessage 展示 | 在回答旁显示错误状态、代码和说明 | TUI 内部组件仅参考行为，不作为公开 React API；Renderer 只收产品 DTO，不收 SDK 对象/原始错误 |

上述源码均可在[固定 Pi 提交](https://github.com/earendil-works/pi/tree/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages)定位。未复制社区实现、未新增依赖、未修改 Pi 发行包。

## ADR-ERROR-01：采用格式化，保留安全投影

复现：Pi 的 normalizeProviderError 能提取 status/body，但 body 4000 字符截断不是脱敏，Error.message 也不受该 body 上限约束；合成凭据可原样出现在 errorMessage。OpenAI 非 2xx 会在 onResponse 之前抛错，不能单靠该回调取得错误状态。SSE error/response.failed 被 Pi 转为 errorMessage，原先只拦非 2xx 不能覆盖这一路径。

候选一：照搬 TUI 原样显示，拒绝，可能把上游回显的密钥、输入或 HTML 落盘。候选二：用正则过滤后展示任意正文，拒绝，未知编码/语义秘密无法保证被删除。候选三：复用 Pi 解析、容器与格式化，只展示有限产品字段，采用；未知详情明确隐藏，不伪造原因。

- 非 2xx 检查最多 16 KiB、最多 min(空闲期限, 1秒)，超大/超时/空/HTML/非法 JSON 仍保留 HTTP 状态，放弃正文。只取 `error.code` 的有限已知值；不把 type/message 当 code。所有原始正文、头部详情与 param/debug 丢弃，再交给原生 Provider；固定 application/json，避免 HTML MIME 干扰原生 SDK。
- 成功 HTTP 中的 SSE 仍全由 Pi 解析。适配层只从 Pi 0.87.1 的错误输出识别已知代码，未知值舍弃；在交付 AgentSession 前删除任意 errorMessage、diagnostics、rawStopReason，保留安全摘要。HTTP 状态从同一调用的 fetch 返回观察，不凭错误字符串推算；流内错误不能冒充 HTTP 4xx。
- 错误摘要不意味着回答正文的任意语义秘密都能被识别；既有消息正文安全显示边界不扩大。取消保持取消语义，正常内容/工具循环保持原生实现。异常 Provider 迭代器也以固定失败结束，不持久化抛错原文或永远挂起。
- 产品 `ModelOutcome.error` 是可选闭合 DTO：`httpStatus`（300–599）、`code`（有限枚举）。没有自由文本、原始响应、URL、请求 ID 或密钥。说明由桌面静态映射生成并标明“上游原始错误正文未保存”；无已知代码不推测 HTTP 401/403 的具体根因。旧记录缺字段继续可读，显示未保存详情；不补写历史错误。
- SQLite 沿用 JSON outcome，无表迁移；Worker IPC 升到 v8，拒绝旧生产者混用，旧已持久化记录仍可重开。错误详情只是展示观察，不成为审批、预算、清理或结算权威。自动重试继续关闭。

回归包含真实受限 Worker + 合成 HTTP/SSE、SQLite 与原生 Session 重开、正文反射 canary、关闭与有界读取、旧 DTO 和 Electron 离线错误展示。真实模型验收另排，不以合成输入宣称历史 401/403 根因已解决。已知代码范围只在有官方证据与接缝回归后扩展。

退出/上游计划：若 Pi 增加稳定结构化且可安全投影的公开错误字段，替换当前针对 0.87.1 errorMessage 格式的有限代码提取，并保留相同安全回归；不 fork Pi、不新增 Provider 解析器。Skill 评估：社区选型需要项目边界判断，尚不适合封装成大而泛的 Skill；本轮维护 AGENTS 规则并复用 Context7 流程，未新增 Skill。

## 真实使用补充：2026-10-03

[桌面闭环报告](../validation/desktop-functional-closeout-2026-10-03.md)确认：Pi原生error也可能源于宿主拒绝工具后的中止，不能仅凭provider_error分类将UI原因写成服务失败。未知详情显示“模型流程未完成”，结合现有工具审批/执行记录核对；有真实HTTP状态/已识别代码时继续展示。只修正产品文案，不改原生或持久历史，不按错误字符串编造原因。
