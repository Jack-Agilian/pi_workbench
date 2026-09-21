# 06 · 连接器、专家、成果与自动化

版本 0.1｜以下是 WorkBuddy 类体验的自研草案。公开功能参考 [S17–S21]，底层实现不假定与对方一致。

## 1. 连接器：定义与账户必须分离

ConnectorDefinition 描述服务、工具、传输、参数 Schema 和授权方式；ConnectorAccount 是用户实际连接的账户实例；ConnectorBinding 是 Project/Run 能访问哪个账户、哪些资源的授权。安装一个“文档服务插件”不应复制发布者账户或自动授权全部个人资料。

```text
Pi Tool -> Tool Broker -> Connector Broker -> Native API / MCP Client
                         |                          |
                    Secret Broker                服务端
                         |
               系统凭据库（opaque account ID）
```

MCP 只是传输和能力发现方式之一，不等同于可信 Connector。协议版本固定并协商；HTTP 授权按选定 MCP 规范处理，STDIO 本地服务器采用自己的凭据传递边界，不能把 OAuth 流程机械套到所有传输。[S29][S30]

## 2. 第一个 Connector 的范围

优先选择一个有明确只读 API、可查询状态的服务，首版只做检索和读取，后续才做创建/修改。OAuth 用系统浏览器，宿主处理回调、state/PKCE 与账户绑定；客户端可访问 API 不等于有权转售所有订阅认证，商业分发前需确认服务条款与应用注册要求。

UI 显示 connected、expired、needs_scope、rate_limited、error。断开时撤销 token 或删除本地凭据、使 bindings 失效；正在执行的外部请求可能无法追回，明确记录。日志只存操作类型和脱敏目标，不能把 Authorization header 留在 Tool Result。

MCP 服务给出的工具描述、注释、结果均属于不可信内容。授权范围由宿主决定；外部写动作要求明确目标、数据摘要和审批。禁止 token passthrough；校验资源受众，拒绝把一个服务 token 发给另一个地址。[S29][S30]

## 3. Expert / Agent Preset

专家预设是配置，不是另一个模型：title、instructions、skillRefs、toolPreferences、modelPreference、requiredConnectorTypes、outputContract。实例化后解析为 ResourceLock 和具体账户 binding。预设能请求更少工具，不能扩大用户权限。

P1 提供代码审阅者、周报整理者、资料分析者。用户可复制改名并测试。P2 的多 Agent 需要独立 Run/Worker、父子关联、预算分配与 Workspace 写锁；不要用多个人设头像冒充真实并行执行。子 Agent 的能力集合不得超过父级授权。

## 4. Recipe / Explore

Recipe 打包任务提示模板、参数表单、预设引用、技能版本、样例输入和成果预览。点击“制作我的版本”首先显示即将使用的能力、外部服务和数据，再创建新任务，不直接启动高风险写操作。

示例成果需标记为示例；输入文件和账户由用户替换。WorkBuddy 的 Explore 公开说明强调案例组合与成果示例 [S18]，可以借鉴这一产品层次，而不是把技能介绍页复制成“探索”。

## 5. Artifact 数据与流水线

```text
生成工具 -> 临时输出 -> 文件/结构校验 -> 内容哈希
         -> ArtifactVersion 注册 -> 预览 -> 用户导出/打开
```

Artifact 负责稳定身份，ArtifactVersion 保存不可变 Blob、mimeType、大小、hash、来源 Run/Tool、输入引用、格式校验状态和预览状态。一个输出文件路径变化不应丢失所有历史；同一路径被外部编辑后必须检测并标记 external_modified。

大文件分块或外部引用，但导出前校验存在、大小和内容。不能从最终回答中匹配一个 `.docx` 字符串就宣告生成成功。文件转换失败时保留原文件和诊断，不把空白预览当成功。

## 6. Office 能力分层

| 层次 | 实现与边界 | 首发顺序 |
|---|---|---|
| 基础预览 | Markdown/文本/图像/CSV，只读 | P0 |
| 确定性生成 | 模板/结构化数据 -> docx/xlsx/pptx 工具 | P1 单格式开始 |
| 格式校验 | 文件可打开、公式/引用/表结构、渲染检查 | 随生成工具一起交付 |
| Office 预览 | 独立低权限转换 Worker，预览副本 | P1 |
| 深度编辑 | 富文本、表格、幻灯片编辑器与版本合并 | 另立项目，非 P0 |

Pi 负责选择与调用生成工具，不负责 Office 文件格式本身。通过 ArtifactEngine 接口接入模板生成器、解析器和转换器。具体库选型要比较许可证、跨平台二进制、CJK 字体、排版稳定性与测试样例，不能以安装一个“PPT 技能”替代这一整条工程链路。

生成 xlsx 的业务功能应支持公式、数据类型与显示格式验证；数值缺失不能填零。PPT/docx 输出检查字体替换和溢出。默认不需要用户安装 Microsoft Office；必须依赖原生 Office 的高级功能单独声明，不能伪称跨平台一致。

## 7. 预览安全

成果 HTML/JS 使用独立受限预览上下文，禁止 Node、宿主 IPC、外部导航与默认网络；允许主动脚本的交互预览另设开关。Office/PDF 解析器同样可能处理恶意输入，放到资源受限转换 Worker，不在 Electron Main 直接解析宏或执行文档脚本。

导出以“另存为”为默认，覆盖已有文件要确认。批量导出检查目标目录和名称冲突。打开链接用允许的协议与确认流程，禁止 `javascript:` 和未经验证的自定义 URI 直达系统。

## 8. 自动化

Schedule 定义 cron/interval、IANA timezone、起止、missedRunPolicy、concurrencyPolicy、权限模板、资源锁策略；Job 表示一次触发；Run 才是实际执行。去重键采用 scheduleId + scheduledOccurrence，不能仅依赖“最近运行时间”。

P0 不承诺自动化。P2 本地版只有 App/Daemon 可运行、设备未休眠且环境可用时才执行。缺失触发默认合并为一次或跳过，不把睡眠期间每分钟的任务全部补跑；时区和夏令时变更保留原规则，明确展示下一次触发。

无人值守只允许预先授权的低风险能力；遇到新权限进入 needs_attention，不能为了保持自动化自动批准。断网重试采用退避和上限；外部写操作只有幂等或已对账后才重试。错误输出需要通知并可查看具体 Run。

资源更新策略默认固定版本。管理员选择“采用选编最新”也要在每次触发前解析、记录锁和权限差异；权限增加时暂停计划任务等待批准。

## 9. 记忆与项目指令

区分用户偏好、项目规则、会话摘要和原始知识材料。用户偏好采用可编辑 MemoryItem，包含来源、作用域、创建时间、到期、是否允许检索。会话压缩不是长期用户记忆，知识材料也不应自动提升为系统规则。

P1 只做用户手工确认的偏好；P2 Agent 可以提出候选记忆，由用户批准。删除必须覆盖索引、缓存与后续资源注入；不能声称能从已经发给外部 Provider 的历史请求中收回内容。记忆不自动保存密钥、证件、隐私材料或账号凭据。

## 10. 端到端例子：月度项目周报

用户选择授权文件夹与“周报整理者”预设；预设要求 weekly-report 技能和可选只读项目 Connector。宿主绑定具体账户、解析资源锁、校验读取范围。Agent 读取材料、整理事实，缺失数据明确标注；ArtifactEngine 输出 Markdown。用户预览后确认导出。后续转成计划任务时重新选择时区、权限和版本更新策略。

这一链路横跨技能、预设、连接器、Run、成果与自动化，不能把它们合并成一个不可审计的插件回调。
