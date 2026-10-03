# 真实桌面文本访问复验

2026-10-03（Asia/Taipei），用户明确授权再试一次。被测提交`61141c78ffcc00ccecde02828c710d7d27c4df00`，macOS arm64、Node24.21.0、Pi0.87.1、Electron44.4.5。没有运行代码差异；AGENTS.md原有未提交修改保留。

结果：通过`npm run desktop:model`与原生UI发送1条明确禁止工具的合成消息，真实openai/gpt-6-luna回复`CONNECTIVITY_OK`。产品Run为completed，原生Assistant的api为`openai-responses`、stopReason为stop，输入5010/输出7 token，0工具操作；SDK估算费用$0.0005045不是实际账单。没有自动重试或追加工具验证。

原系统临时项目已消失，UI正确禁用旧会话发送。本轮新建空的合成目录，通过原生目录选择器新建会话；旧会话仍保留，未伪造恢复原项目。使用原应用profile、凭据入口和费用账本；启动前累计21请求，结束后22请求，旧21行逐行摘要不变；累计保守预留$0.753632/$1，剩余$0.246368，活动Run0。与10月1日报告间新增的3个历史请求不算作本轮代理发起。

只读核验复用现有`auditLedger`/`runEvidence`：原生Session落盘，收据匹配绑定且exited/groupGone=true，Worker PID/组已不存在，合成目录仍为空。[脱敏结果](q1-desktop-retry-inputs-2026-10-03.json)可随新克隆定位；即时输出在`.artifacts/q1-desktop-retry-2026-10-03/`。原生UI连接曾中断一次，重连后发现目录选择器已打开，未重复发送模型请求。

上游错误诊断缺口仍在：`apps/agent-server/model-http.ts`保留HTTP状态，却取消并丢弃非成功响应正文，向Pi发送固定的`api_error`/`Provider request failed`，以免上游回显凭据或输入进入原生历史。因此历史401/403的原始错误码/说明现在不可恢复；本次成功也不能证明之前失败原因是睡眠。后续应在宿主设计受限的错误投影（状态、经过白名单处理的类型/码及安全说明），验证凭据回显/畸形/超大错误后再集中续验；不得直接透传原始错误正文或把固定api_error冒充上游错误类型。

本次只证明单次真实桌面文本访问恢复，不证明read/write/edit/Bash、允许/拒绝、活跃取消、原会话成功续接或完整人工体验。本轮没有新增运行时功能；新增了可复核的成功证据并推进当前计划，旧失败报告保留。UI-01/02、ART-01与既有Gate范围不扩大。

本轮文档收口检查：check-ssot 60/60、test-tools 15/15、check-docs --structural-only 5通过/2跳过，git diff --check通过；均使用既有.venv Python。未修改运行代码，不重复声称前轮桌面38项及模型离线45项为本次运行。新增JSON仅保留批准的合成回复、统计与清理证据，不含配置、凭据或原生Session路径。

Skill评估：本轮复用既有产品/只读审计入口；现场UI、临时目录消失和外部访问判断仍依赖现场情况，不新增自动验收Skill。
