# Q1集成后的真实桌面检查

本轮结论：Q1已集成develop；真实桌面能够显示原会话、工具结果和核验成果，但本次新模型任务未成功。两个代理操作的请求均返回HTTP403；用户另行手动发送的两个请求分别为401、403。没有执行工具，不把失败请求或旧成果浏览称为完整真实桌面工具验收。

## 基线、环境与入口

- 被测提交：`ee409b1606c794fb853290e7e238bc30eebe638d`，其中运行代码为`5b10b19fb608159a37459592b265c6392d0d5331`；本次未修改运行代码。工作树已有AGENTS.md差异保留且不纳入提交。
- 2026-09-30至2026-10-01（Asia/Taipei），macOS27.0/26A428 arm64、Node24.21.0、Electron44.4.5、Pi0.87.1。
- `npm run desktop:model`两次启动，使用原应用profile、原配置和费用账本。无测试模式、Mock Provider或替代CLI；界面操作由Codex的原生UI工具完成，用户后续手动操作单独归属。
- 原始日志在`.artifacts/q1-plan-review/`；跨克隆可读的[脱敏审计](q1-desktop-live-inputs-2026-10-01.json)和[API核对](q1-api-check-2026-10-01.json)随文提交。未保留凭据、原始Provider错误或请求正文到这些提交文件。

## 实际操作与结果

| 场景 | 实际结果 | 范围 |
|---|---|---|
| 原profile启动 | 显示此前5个会话、原取消执行的SIGTERM结果 | 本次真实Electron读取已有产品状态 |
| 新建合成会话并发送任务 | 持久接收Run a78db693；计划read→write→edit→只读Bash，首个请求403，状态failed，0操作 | 真实请求失败；上述工具步骤均未到达 |
| 原成果浏览 | 打开原成功会话，正文/工具结果/后续回复可见；report.md预览显示count3、sum10、marker cedar-shell-30，文件核验与登记版本一致 | 本次只读界面检查；成果由历史真实任务生成，不是本轮新成果 |
| 关闭重开 | 点击关闭后启动进程exit0，lsof无产品库占用；再次启动显示失败Run及原提示词 | 本次正常退出/持久化重开；不代表活跃强杀或进程故障注入 |
| 用户提示可能睡眠后明确重试一次 | 同一Thread、同一原生Session接收Run50479cce，仍403，0操作 | 有响应状态码，不能直接归因为睡眠断网；没有连续自动重试 |
| 用户手动请求 | Run870f97ed为401、c50abadf为403，各1次请求、0操作；用户已确认手动发送 | 不记作代理追加请求；也不记作成功人工验收 |
| 真实持久化对账 | 4个Run均failed；原生Session已保存；各自清理收据匹配绑定、exited/groupGone=true，Worker PID及进程组均ESRCH；原14条请求逐行摘要不变，活动Run0，新目标文件不存在 | 只读SQLite与现有runEvidence核验；无手工hostClean、无清账或重发 |

代理共发2次新请求；观察窗口账本增加4次（另2次用户手动），累计18次。累计保守预留`$0.616608/$1`，剩余`$0.383392`，是审计时快照；不是实际账单，不因错误显示0 token而删除预留。请求次数仍缺省不限，文件8操作/Bash6命令、30分钟LLM总期限、5分钟网络空闲、512输出上限均未改。

两次启动过程中原生UI工具曾选中Electron默认窗口，需要重新选取工作树内应用并聚焦；未把无变化点击算作通过。第二次启动日志出现Electron资源路径sandbox_extension_issue_file警告，窗口/宿主仍启动并完成重开检查；没有据此更改系统权限。临时审计脚本首版对并发手动请求数量及状态作了错误假设而断言失败，随后按实际账本和原生记录重新核对；它不是产品测试失败，也没有删掉新增记录以满足预期。

## Responses与message核对

当前配置为openai/gpt-6-luna，沿用Pi0.87.1目录的`openai-responses`；base path为`/v1`，描述器产生`/v1/responses`。两次代理Run保存的模型计划仍为openai，四条原生Assistant记录均为`api: openai-responses`。宿主ModelHttp严格比较批准URL且禁止重定向；没有切换到Anthropic的`/v1/messages`。本次没有捕获或输出带凭据的原始HTTP请求。

`message`是消息对象/错误对象字段，不是端点名称。Responses也使用message类型的输入/输出项；请求顶层为input，Chat Completions才使用messages数组，见[OpenAI官方迁移说明](https://developers.openai.com/api/docs/guides/migrate-to-responses)。通过Context7与官方网页交叉查阅；未修改协议、Provider或查询endpoint背后的服务。

## 验证、未完成与下一步

本次重跑`npm run test:desktop` 38/38；API疑问产生后重跑`npm run test:model-integration-offline`，45/45通过，包含真实Worker中的OpenAI协议/URL、401脱敏、原生重开与取消；合成HTTP且禁止外网，不是服务连通性证明。配置检查、原账本预检与文档回归见[Q1计划复核](q1-plan-rereview-2026-09-30.md)。Q1其余完整类型/Pi/Electron矩阵沿用原5b10b19报告，不冒充本次重跑。

最终文档检查：`.venv/bin/python scripts/check-ssot.py` 60/60、`scripts/test-tools.py` 15/15、`scripts/check-docs.py --structural-only` 5通过/2按模式跳过；`git diff --check`通过。审阅本次diff及新增JSON，未纳入凭据、真实配置、原生历史或忽略目录；仓库检查的敏感文件名/私钥标记通过不等于完整秘密扫描。

当前唯一事项仍为真实桌面使用检查，模型请求被401/403阻塞。先恢复现有配置端点的访问，再在原profile续验成功会话、read/write/edit、逐项允许/拒绝、活跃取消与恢复；不要为此切换到messages、重设费用账本或以付费调用调试Q1。未完成的真实工具步骤、完整用户人工体验、历史另一工作树UI超时、Windows/PTY/生产发行均保留。UI-01/02与ART-01保持in_progress，既有Gate不扩大。

本轮新增交付是Q1集成、计划澄清及可复核的真实失败/恢复证据；没有新增运行时功能。Skill评估：包含现场UI与外部访问判断，尚不适合固化成自动验收Skill；复用现有配置、审计和测试入口。此次使用的OpenAI Docs/Context7流程仍适用，无需修改Skill。
