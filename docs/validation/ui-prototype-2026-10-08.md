# 全路径交互原型与规格 v2

2026-10-08。基线 `bbc4e170a74a0974ce5dd8f5c6fdbfc0216b1e17`；分支 `codex/ui-correctness`。实际被测原型/规格提交：`e4ed5c41719e22829798ed0e525b1b027dd72a52`。本报告随后提交，不用尚不存在的文档提交充当被测SHA。

## 新增内容与边界

交付[可交互原型及演练方法](../design/workbench-prototype/README.md)：新建/选择会话、输入/排队、允许/拒绝/停止、Chat打开文档、版本来源、权限未确认、断线/未知和文件改变。均为明确合成状态，没有产品桥、数据库、Worker、文件执行或模型。用户输入只进入样例，不被解释执行。无新依赖，产品源码未改；正式UI仍以本报告基线为准。

现有Pi/宿主审批、权限、身份和副作用不变量不变；没有将原型自建状态视为产品实现。参考映射和来源文件摘要随原型提交；社区源码借鉴的是位置/信息分组，未移植其运行框架。

## 关键设计结论

| 空间 | 原问题/取舍 | 本次候选方案 |
|---|---|---|
| 导航/目录 | 新建目标与当前会话目录混淆，表单和状态平铺 | 新建时选目录，当前目录在顶部可查；会话行只补必要同名区分，标题改名 |
| 会话/输入 | 正文和输入宽度不一致，正常工具占多层卡片 | 共同阅读轴；普通操作按组展开，保留可信独立记录，未伪造正文/工具穿插 |
| 当前审批 | 早期原型用顶部提醒跳转到聊天卡，决定不在稳定区域 | 改为输入框上方固定当前操作，目标/关键影响/拒绝/仅本次允许集中；长证据在只读详情，历史不重复有效按钮 |
| 权限 | 标签和技术说明常驻，失败可能埋入面板 | 当前值＋更改权限提示＋展开三档；未确认在面板外可见并保留原值 |
| 文档 | 登记管理主导，正文被固定小盒限制 | Chat登记文件入口打开右侧正文；文件选择、复制、版本来源、关闭置于统一标题栏 |
| 自动打开 | 首次发现与打断旧记录阅读冲突 | 宽窗仅前台首次新登记、正在最新位置且未手动选/关时可自动一次；窄窗/不能可靠识别时点击打开；重连/补页不触发 |
| 窄窗/动效 | 按固定宽度动画挤压文本，多重覆盖 | 依据实际剩余空间切内容带预览；输入区隐藏时可返回审批；宽度立即切换，轻量出现为候选，未宣称动画体验验收 |

**审批位置补查**：OpenCode固定a697115的`SessionPermissionDock`位于`session-prompt-dock`；T3 Code固定9fba209的审批内容/动作位于`ComposerBanner.Attachment`。两仓README明确含桌面应用，MIT许可已读。直接源码支持输入区方案，不支持“所有社区都一样”的断言。Claude Desktop文档只证明权限模式选择器在输入附近，未据此推断其单次审批位置。完整链接/哈希见[来源摘要](../design/workbench-prototype/approval-sources.json)和[参考映射](../ssot/reference-implementations.md)。这是本轮发现的研究遗漏，前次审核报告保持历史原貌。

## 实际验证

平台macOS 27.0.1（26A434）arm64；使用项目已有Node 24.21.0、Electron 44.4.5和`.venv`。Electron隔离临时profile，Renderer不开Node，启用contextIsolation/sandbox；拒绝非file/data加载。此配置只是原型检查环境，不是本项目OS沙箱证明。产品Provider调用0。

| 实际命令/动作 | 结果与范围 |
|---|---|
| `.artifacts/toolchains/node-v24.21.0-darwin-arm64/bin/node --check docs/design/workbench-prototype/app.js` | JS语法通过 |
| 同一Node运行`node_modules/electron/cli.js .artifacts/ui-prototype-20261008/check.cjs` | 被测SHA提交后复跑41项通过；无Renderer异常，检查窗口网络尝试0；逐项持久摘要见[JSON](ui-prototype-2026-10-08.json) |
| Electron截图＋主代理目视 | 查看宽窗完整文档/待批、权限面板、200%及620×420审批；审批按钮/目标可见，未把截图当作全部交互通过 |
| Chromium `sendInputEvent` | Escape关闭证据并还原焦点、Tab由拒绝到允许、方向键调导航宽、Home复位；不同于OS原生键盘代理操作 |
| `.venv/bin/python scripts/check-ssot.py` | 60项通过 |
| `.venv/bin/python scripts/test-tools.py` | 15项通过 |
| `.venv/bin/python scripts/check-docs.py --structural-only --report .artifacts/ui-prototype-20261008/docs.json` | 5通过、0失败、2按结构模式跳过；文档更新后再运行 |
| `git diff --check`及已暂存文件检查 | 无空白错误；本批文件仅设计/SSOT/计划/验证，未纳入profile、原始来源、凭据；有限秘密模式扫描无命中，不声称完整秘密审计 |

原型检查包括允许后仅进入执行、拒绝无文档、停止等待合成清理、权限未确认阻止发送、重连保留未知、对账不自动打开、文件改变不显示旧正文、草稿隔离、首次自动与手动关闭、唯一有效审批以及窄窗返回焦点。窗口矩阵：初始1320×860外框；820×640内容区；1320×860内容区200%（CSS视口660×430）；620×420内容区。浏览器内DOM点击用于状态检查，不能写成用户人工操作或真实审批执行证明。

临时检查驱动和截图在`.artifacts/ui-prototype-20261008/`，不作为新克隆唯一依据；已提交原型、演练步骤、逐项结果与文件SHA-256可定位。新克隆可直接打开HTML或按README启动仅本目录的localhost静态服务，按演练步骤复核；临时Electron驱动没有作为正式产品测试入口交付。

## 失败、修正和未验证

- 最初内置浏览器打开localhost超时；静态服务HTTP 200，随后用已有Electron加载本地文件完成验证。未修改系统代理/权限，不能把IAB超时当产品失败或修复成功。
- 初次Electron渲染出现`sandbox_extension_issue_file ... Operation not permitted`警告，仍取得页面和截图；最终检查日志仅报告通过。未授予额外权限，也未宣称警告根因已解决。
- 第一版检查因停止说明的精确文字不同失败，改为匹配实际“合成宿主已确认执行与清理结束”，没有放宽状态断言；失败日志保留。
- 初版200%画面显示聊天内审批容易离开视口，曾用顶部跳转提醒补救。用户指出后补查真实社区源码，改为输入区审批；这是布局修正，不是给原方案补辩护。另修正场景重置残留toast，以及缩放切为文档覆盖时审批返回提示未更新。
- 未验证真实IME、VoiceOver、OS原生连续输入、全部动画/减少动态效果观感、多待批与长Bash、多错误同时占位、产品历史滚动锚点；原型只含一个待批文件操作。未运行产品类型/A1–A4/Worker/Electron集成回归，因为未改产品；下一实施批必须按影响范围运行，不能援引本报告替代。

## 规格与接续

更新节点：ROOT、PRINCIPLES、FOUNDATIONS、MOTION、SHELL、NAV、WORK、HEAD、FEEDBACK、CHAT、MESSAGES、TOOLS、COMPOSER、PERMISSION、ARTIFACTS、PREVIEW。保留既有节点ID/路径，正文和当前对象优先，未新增第二套业务状态权威。

唯一当前事项仍为信息层级重构与日常体验复审，下一步是将本组方案接入正式界面，复用现有查询、布局、滚动、草稿、审批及文件核验所有者。先补齐产品多待批/长命令/错误占位样例，再成组实施和集中回归。UI-01/02、ART-01保持in_progress；不新增实现通过的adoption/evidenceRecords，不扩大Gate，不自动合入develop。

Skill复用评估：`workbench-ui-design`与Context7流程本轮仍适用，结论NO_CHANGE。审批位置遗漏属于必须实际执行“核对动作位置”这一步的问题，现有Skill已有该要求；不为现场审美判断再创建一个大Skill。无系统环境或运行入口变化。
