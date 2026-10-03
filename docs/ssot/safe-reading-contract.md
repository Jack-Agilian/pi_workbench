# 安全正文阅读

2026-10-04。继承[会话界面](ui-experience-contract.md)、[宿主历史边界](backend-history-contract.md)和[指定参考](reference-implementations.md)。只增加正文展示及原生记录的只读投影，不改变执行、审批、取消、成果或原生Session的所有权。

## 实施前参考与采用

| 本项目模块 | 参考/API | 采用范围 | 保留边界 |
|---|---|---|---|
| MessageMarkdown | pi-gui固定`163054227d370a49d09099c61eb65798481294ac`的[message-markdown.tsx](https://github.com/minghinmatthewlam/pi-gui/blob/163054227d370a49d09099c61eb65798481294ac/apps/desktop/src/features/conversation/message-markdown.tsx)及timeline-item | 相同React Markdown/GFM选型、memo避免重复解析、表格局部横滚；行为参考，无组件复制 | 不搬SessionDriver、文件路径解析或外链打开；产品消息身份不由Markdown决定 |
| Markdown解析 | `react-markdown@10.1.0`默认运行时导出与`defaultUrlTransform`；`remark-gfm@4.0.1`默认运行时插件；Context7核对skipHtml/components/allowedElements/安全说明 | 精确依赖和唯一npm锁；代码、标题、列表、引用、表格、任务列表 | 无rehype-raw或动态插件；任务复选框只读，不成为执行入口 |
| pi-adapter/native-text | Pi0.87.1根级运行时`parseSessionEntries`、`SessionManager`；公开类方法`inMemory(cwd, options, entries)`、`getBranch(fromId)`、`getEntry` | 用公开解析器及内存树从已批准文件读取给定分支范围 | 不手写JSONL/消息树，不调用会迁移磁盘的`SessionManager.open`，不创建AgentSession/扩展/Provider |
| Worker/Core | 原Session引用、实例绑定/去重、SQLite事务 | 执行前后记录原生起止entry ID；宿主绑定路径及Run，SQL v13只保存引用范围，Worker IPC v12增加项目自有native-range消息 | 来源绑定真实子进程；范围结束不是清理证据，不能据此结算Run；不复制正文到产品库 |
| NativeText/TimelineScroll | 既有Thread/Run/queryScope隔离及单一滚动所有者，固定pi-gui viewport参考 | 用户主动补读，游标续页、关闭/切换/重连废弃旧回调；阅读动作冻结当前Run锚点 | 不创建通用RPC、缓存框架或第二个scrollTop写入者；Q2/Virtual不是前置 |

发行资料、tarball SRI/sha256及逐文件安装核对见[输入记录](../validation/safe-reading-inputs-2026-10-04.json)。两个包MIT许可进入THIRD_PARTY_NOTICES；未升级原依赖。Pi类型只在适配包内部和测试使用，Renderer只见产品DTO。

## 读取与身份

产品`native-text`请求仅接受Thread ID、Run ID和有界游标；可携带既有连接期望身份。拒绝路径、SQL、原生对象和任意执行参数。宿主先核对Thread/Run归属，按持久记录确定文件和起止ID；实际文件必须是该Thread管理Session目录中的规范普通单链接文件，拒绝符号链接、错误cwd及无效范围。

Worker在开始执行前、最终展示发布后分别上报原生叶ID。宿主校验当前绑定、阶段及已保留路径，不接受Worker传数据库/新路径。SQL v13的run_native_ranges是只含引用的产品索引，没有另一份消息树。旧库迁移为空索引，不猜测历史Run范围；开始未完成、终止后缺结束范围、缺文件或超限均明确返回状态。不会为读取重新执行任务。

文件在读前后核对身份和修改信息；固定最多8MiB读取缓冲，超出返回too_large。这是当前读取/解析保护，不是模型次数、费用或生成token门槛；暂不声称支持无限原生历史。解析及分支计算归Pi公开API；外围拒绝重复ID/缺失或逆序parent等畸形数据，避免坏文件导致无界遍历。没有扩展发现、auth读取或写回。

每页正文最多16KiB UTF-8、最多16个片段，片段保留原生消息ID、role、UTF-16 offset和消息结束标记；不会拆开代理对。用户/Assistant的text正文可完整分段读出，思考、图片/附件、原始工具参数/结果不透传。工具失败只返回原有固定安全说明，操作事实仍来自Operation。

已知凭据格式在整条消息上过滤后再分段，避免跨页拼回秘密；不是任意语义秘密检测。游标绑定Run、起止范围及当前原生范围摘要，拒绝跨Run或内容变化；后续其他Run追加不改变原范围。Renderer仅拼接同ID/role且offset连续的片段；全部页结束只表示本次**可展示正文**已读完，不表示包括思考/附件/工具原文。

## 展示与恢复

摘要和补读正文共用安全Markdown。原始HTML丢弃；图片显示替代文字且不请求远程资源；只有HTTP(S)地址作为可选择文本展示，其余协议不生成链接。当前外链不可直接打开，文件链接也不绕过成果核验。禁导航、脚本或数据资源执行，保留原Electron CSP。

读取成功后以原生正文替换该Run的有限摘要；缺范围/文件、未落盘或错误时保留摘要并解释。只读重试不执行产品命令，不自动重试。关闭可在等待中使旧回复失效；Thread/Run/连接组合变更重置临时正文。正在运行的审批/停止不依赖补读结果。外层shell不可程序化滚动，正文滚动继续由原hook管理。

原生全文与产品操作仍分区展示，不推断原文片段和工具操作的穿插次序。合成模式保留合成标记/测试说明；本批没有真实Provider调用或用户人工验收。

## 限定验证与剩余范围

[本批结果](../validation/safe-reading-2026-10-04.md)记录被测提交、开发失败和平台。旧Run无范围不会凭猜测回填；超过8MiB原生Session、全文复制/代码复制、可点击外链、附件/图片、更多语言高亮和完整人工/无障碍体验未完成。没有提高既有M0 Gate或把UI任务改成done。下一事项为整套桌面工作流复审与收口，具体以NEXT_STEPS顶部为准。
