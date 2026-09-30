# Agent Shell：本地实施与集中离线证据

2026-09-30，macOS 27.0 arm64，Node v24.21.0 arm64、Rosetta=0，沿用Pi 0.87.1、Electron 44.4.5及唯一npm锁。**新增真实模型请求0次**，没有读取用户凭据或探查模型endpoint背后的服务。受限Bash与文件/进程是真实执行，Provider/SSE、故障控制点和dialog选择结果明确为合成输入。

## 基线与被测提交

- develop独立读回：`148022b05250cfda824725778e9a056d00cd6830`。
- 本轮功能分支 `codex/agent-shell-mvp` 从 `51ea53462eacdc4ed8ffc3fb48b260b87631b5a2` 继续，未新开孤立分支，未合并develop。
- 实现提交：`6cd011a2cc57a6a5e9eb7a73e7f4f994291de9d3`。26条命令集中执行，23条成功、3条失败，下面保留失败与后续修正。
- 兼容修正提交：`0c28ed294ced615892f36b827f8d032a7161bc0b`。11条受影响命令全部通过。初轮已通过且代码未变化的A1–A4、网络/配置、UI/退出检查沿用其原被测SHA，未冒称全部在新SHA重跑。
- 代码测试期间有SSOT/说明文档的未提交修改，没有未提交运行代码差异。逐命令SHA、退出状态、测试数及原日志摘要见 [持久输入/结果](agent-shell-inputs-2026-09-30.json)。原日志在工作树 `.artifacts/agent-shell-local/`，SSOT只引用本报告和提交内摘要。

## 复用与实际变更

复用Pi公开Bash定义/Operations、顺序执行元数据、Agent Loop、原生Provider/Session和既有ShellExecution/guardian。新增显式shellTools策略、逐命令持久启动与独立收据、guardian关闭清单、恢复核验；普通已知非零退出保留failed操作并回到Pi，拒绝/超时/取消/未知保持阻断。

新增原生目录选择私有入口，宿主保存Workspace身份及选择；现有Thread不会换目录。Renderer没有自由路径/执行入口。界面显示实际cwd、禁网策略、阶段状态与独立命令结果。SQL v9/IPC v7仅补必要接缝，依赖、锁、声明补丁、初始化逻辑和docs/startup不变。详细限制见 [契约](../ssot/agent-shell-contract.md)。

## 命令与结果

所有npm命令使用现有项目固定Node，测试launcher仍构造隔离目录/环境并阻断意外网络；没有重新安装或全局升级。

| 命令 | 实际结果与范围 |
|---|---|
| `npm run typecheck` | 两个代码SHA均通过；声明补丁校验通过 |
| `npm run test:pi-types`、`test:pi-probe`、`test:pi-tools`、`test:pi-shell`、`test:pi-resources`、`test:pi-auth` | 实现SHA通过；真实发行包接缝/隔离测试，非真实Provider |
| `npm run test:pi-packages` | 首轮缺缓存失败；复制本项目已有缓存后，修正SHA离线8/8通过，无网络准备/下载 |
| `npm run test:product-core`、`test:product-sdk` | 修正SHA分别20/20、5/5；保留首轮SDK兼容失败 |
| `npm run test:product-worker`、`test:product-shell` | 两轮均51/51、28/28；真实进程/旧固定Shell/恢复边界 |
| `npm run test:model-integration-offline` | 两轮均42/42，合成模型接缝 |
| `npm run test:model-resume`、`test:model-network`、`test:model-config` | 实现SHA通过；没有真实续验 |
| `npm run test:product-file-agent` | 两轮34/34，保留M2/F01与审核回归 |
| `npm run test:product-model-shell` | 两轮15/15；本轮新增SDK/进程范围详见下文 |
| `npm run test:file-acceptance` | 实现SHA13/22失败；兼容修正后23/23通过。该轮文档未提交，CLI子用例仅验证脏工作树门禁，不宣称完整prepare通过 |
| `npm run test:desktop` | 两轮20/20，包含目录持久化/身份不变/活动任务拒绝切换 |
| `npm run test:desktop-ui`、`test:desktop-shell`、`test:desktop-model`、`test:desktop-file-agent`、`test:desktop-agent-shell` | 实现SHA真实Electron通过；Provider/原生框选择合成，不是人工验收 |
| `npm run test:desktop-shutdown` | 实现SHA24个既有实际退出场景通过；没有扩大为任意恶意后代或Windows证据 |

开工时 `.venv/bin/python scripts/check-ssot.py`（60）、`scripts/test-tools.py`（15）、`scripts/check-docs.py --structural-only`（5通过/2跳过）全部通过。文档更新后的检查单独记录在后续收口段，不拿开工结果替代新文档检查。

## 新增15项的证据范围

- Chat Completions与Responses合成SSE各一项，实际Pi提出两条顺序Bash；重复启动/重复批准不重复执行，非零7的输出进入下一轮，第二条命令成功，每条独立JSON收据，重开库不重写文件。
- 拒绝、活跃取消、执行超时、命令额度、资源内容变化五项；下一次不获准请求/执行，未生成迟到文件。取消承认可能已发生的文件副作用。
- 策略校验一项：旧配置不开Bash，timeout修订不能扩大权限，cwd/env/超大/非法timeout参数拒绝。
- 真实App Server SIGKILL三项：待审批、启动记录提交而未发送、收据已完成但未入库。重开SQLite，读取真实guardian清单/收据，只核验不重放；“已写未确认”文件字节及mtime保留。
- 真实Worker在长命令/固定sleep后代执行时SIGKILL一项；核对后代停止、迟到文件不存在，恢复仍unknown并拒绝释放，不凭清理假定副作用已知。
- 实际动态Bash调用Node SQLite一项：读取合成宿主库、创建宿主目录内新库均被Mac OS限制拒绝；没有使用真实用户库。既有其他文件/网络边界由对应旧套件回归，未把本项扩写为全面沙箱证明。
- v8→v9一项：已有实际文件Operation/Run/模型请求账本保留，新增表为空；旧版本前向迁移另由原回归覆盖。
- IPC一项：新增消息封闭字段、版本、身份格式和大小门禁。实际旧来源/未知/超大消息接缝仍由51项Worker及34项文件Agent回归覆盖。

## 界面核查

实际Electron，分别捕获1320×860、1024×720、820×640下的审批折叠/展开状态，共6张。DOM断言无横向溢出、允许批准/停止可命中、输入区在视口内；同时走原生框选目录的调用契约、两次批准、真实Bash文件、重连后不重放。原生框返回值由可信测试替代，不等于人工点选过系统窗口。

[小窗口展开截图](agent-shell-expanded-820.png) · [桌面审批截图](agent-shell-approval-1320.png)。持久JSON保存全部6组布局度量；PNG可能为Retina像素。截图里的路径仅为被移除的合成临时目录，不含用户项目/凭据内容。

## 失败与修正

首次集中回归的三条失败不隐藏：A3缓存未复制；ProductCore新增规则错误地把旧无模型探针的denied操作也当成不可完成；文件验收驱动仅接纳v7/v8库。修正限定于旧SDK结算兼容、v9只读账本准入，并明确拒绝shellTools配置进入仅文件验收驱动。新模型Run拒绝继续由宿主fileFailed/Operation状态控制，拒绝/取消断言未削弱。

定稿前还修正了新增类型推断、模拟旧库时未删除新表，以及桌面测试夹具误在受保护profile内创建目录的问题；没有放宽目录隔离或用忽略类型错误通过。早期日志仍在本机原始输出目录。

## 状态与未验证

MODEL-03保持in_progress；MODEL-04新增为in_progress，A01–A03仅离线限定证据，A04真实任务没有证据。M0-UI/M0-SDK沿用原passed，M0-Pi仍blocked。真实授权旧4/4不重置；没有更改本机配置、真实账户、Git权限或服务设置。

未覆盖真实模型Bash、真实长流、人工IME/读屏、任意脱组/恶意后代、PTY、其他平台、生产安装包。未重跑初始化/新克隆；本次只有项目缓存复制与现有依赖测试。缺失/歧义命令收据仍保留unknown/blocked，没有强制清理审计入口。Bash生成文件不自动变为Artifact。


## 文档检查收口

更新后的 `.venv/bin/python scripts/check-ssot.py`、`scripts/test-tools.py`、`scripts/check-docs.py --structural-only`、`scripts/check-docs.py --typecheck` 全部退出0。覆盖任务/证据引用、原始27个快照、文档链接/已知凭据标记及示例类型；不推导外部服务或系统隔离结论。此时运行代码为0c28ed2，文档为待提交差异，已在持久JSON明确记录。


## 干净工作树复验

文档提交 `d8ea2152f42571169c5957ff315a18183e36294a` 后，确认工作树干净再运行 `npm run test:file-acceptance`：23/23通过，CLI prepare/inspect、重复prepare拒绝、非交互execute拒绝均真正执行，未走“脏工作树只测门禁”的提前返回；仍是隔离合成配置，无真实请求。随后SSOT、脚本、结构及完整文档类型四条检查全部通过。该提交的运行代码与0c28ed2相同；本段是后续文档证据，不把尚不存在的提交写成被测SHA。
