# 正文复制与成果版本操作

2026-10-08文档归位：本文件保留业务/数据/进程契约及既有实施记录；位置、大小、布局、动效和控件呈现的唯一规格见[MESSAGES](ui/shell/workspace/conversation/messages.md)和[PREVIEW](ui/shell/workspace/artifacts/preview.md)，后续相关改动在该节点维护。早期阶段的未实现/下一步陈述只属于当时范围，当前顺序以NEXT_STEPS顶部为准。

2026-10-04。沿用[安全正文阅读](safe-reading-contract.md)、[产品历史](backend-history-contract.md)和[界面契约](ui-experience-contract.md)。这是桌面展示与本机纯文本复制，不改变模型、Pi Session、执行、审批或文件访问范围。

## 实施前参考与采用

| 本项目模块 | 参考文件/API | 借鉴/采用 | 保留边界 |
|---|---|---|---|
| MessageMarkdown/CopyText | pi-gui固定MIT提交163054227d370a49d09099c61eb65798481294ac的[message-markdown](https://github.com/minghinmatthewlam/pi-gui/blob/163054227d370a49d09099c61eb65798481294ac/apps/desktop/src/features/conversation/message-markdown.tsx)与[timeline-item](https://github.com/minghinmatthewlam/pi-gui/blob/163054227d370a49d09099c61eb65798481294ac/apps/desktop/src/features/conversation/timeline-item.tsx) | 内容旁提供复制动作；公开Markdown组件扩展。固定上游的复制主要在工具卡，并没有直接可移植的消息/代码复制组件；本项目新增薄展示组件 | 不复制原生对象、工具原始参数/结果或社区SessionDriver；无新社区代码移植 |
| MessageMarkdown | 已采用react-markdown10.1.0公开`Components.pre`及`node`（类型/组件prop），现有remark-gfm4.0.1 | 从解析器提供的单个code/text节点提取已展示代码，包含解析器的结尾换行；无需DOM抓取/额外解析器 | 不用已移除的code.inline；无HTML插件、新语言高亮或链接执行。代码内容是展示投影，不保证与原文件字节相同 |
| Electron main/preload | Electron44.4.5根级运行时`clipboard`及异步方法`clipboard.writeText`，现有contextBridge/ipcMain来源校验 | 窄的`copyText(string)`桥，只写纯文本并等待成功；失败仅返回闭合结果 | 不开放clipboard.read/readText、HTML格式、任意IPC、Provider或OS执行；不放宽浏览器权限 |
| ArtifactPanel | 固定pi-gui[file-editor-pane](https://github.com/minghinmatthewlam/pi-gui/blob/163054227d370a49d09099c61eb65798481294ac/apps/desktop/src/features/workbench/file-editor-pane.tsx)内容旁动作、既有宿主preview及成果分页 | 已核验预览复制、同路径版本选择、登记摘要/来源说明 | 不移植其任意文件打开/编辑器。只浏览本会话**已加载**版本；剩余成果继续原分页，不伪称全库版本列表 |

Context7查询Markdown组件和Electron剪贴板接口；其main文档只辅助语义。已核对本机react-markdown10.1.0声明和Electron44.4.5声明（writeText确为Promise），实际接缝由Electron回归验证。无新依赖/安装/锁文件变更，不新增Pi入口；沿用此前发行证据。

## 复制内容与反馈

摘要只提供“复制已显示输入/正文”；原生补读中的未完消息提供“复制已加载部分”，消息结束后提供“复制可展示正文”。这只包含已经加载、经过安全过滤的text，不包括思考/附件/原始工具结果。按钮说明保留Markdown纯文本；代码块仅复制解析后的代码，按钮文字与反馈不进入剪贴板。点击不自动补读、不调用模型/工具。

复制异步完成后才显示“已复制”；失败显示重试/手选提示，不输出底层错误或复制内容，不自动重试。文本或组件身份改变后旧结果不能显示为新内容成功；已交给系统的写入不能保证撤回，不声称关闭会取消系统剪贴板写入。每按钮防重复，main同一时刻只接受一个写入，过载明确失败。

主进程沿用实际window/webContents/mainFrame/origin身份校验；拒绝已销毁/关闭、非字符串、额外参数及超过8MiB UTF-8字节的请求。此上限只保护本机文本传输，不是模型生成或费用额度。复制入口不进入App Server/Worker或产品命令账本，Renderer没有通用读取剪贴板权限。合法页面的被动文本不会触发复制；页面被攻陷后的任意脚本并不由此获得“真实用户点击”证明，不能将此桥宣称OS权限隔离。

## 成果与版本

当前可登记成果仍限宿主批准的Markdown文件。MD标记表示登记名称的类型，不是下载按钮；泛型图标回退不代表新增格式支持。版本选择列出已加载同路径记录，按登记版本倒序；hasMore时明确未全部加载，使用原“加载更多成果”继续，不新建缓存或第二份版本索引。

每次选择版本仍重新请求宿主preview；只有当前文件原始字节摘要匹配登记记录且可安全读取才显示内容。changed/missing/unavailable和请求失败都不提供内容复制；重试只重新核验，不重放工具。登记信息明确SHA-256对应文件原始字节；预览经过已知凭据过滤，复制内容不能用于重算该摘要。核验时间是上次检查的时点，不承诺文件始终不变。

历史版本只保存登记元数据，未保存历史文件字节；选择旧版时当前文件若不匹配，就说明不匹配并保留审计，不伪造旧内容或回滚。来源Run/Operation完整身份必须可查；具体展开与焦点规则见PREVIEW。线程/连接变化沿用原组件身份失效。

## 后续边界

无任意文件打开、下载、自动外链、历史文件快照、版本差异算法或消息全文检索。旧Run缺原生范围、8MiB原生Session读取限制继续明确保留。完整布局密度、键盘/200%缩放/VoiceOver与实际人工使用仍须后续集中复审，不因复制或版本选择通过而将整体UI任务/Gate完成。
