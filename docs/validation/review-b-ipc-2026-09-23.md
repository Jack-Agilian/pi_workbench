# B-IPC 审核修正与验证（2026-09-23）

结论：外部审核 R1/R2/R3 均成立；原报告第 5 项 Session 引用风险也由真实 Worker 补测确认。本轮四项已修正，并在项目 macOS 环境回归通过；唯一下一步恢复为 C 最小桌面界面，本轮停止于 B-IPC。没有将任何相关能力或 M0 Gate 整体标为完成。

## 基线、来源与实测提交

继续使用 `codex/b-worker-ipc`，修订基线 `d3bb551fa83dc4bcfe4b67a74c2ff1025ca42d2d`。开工工作区干净；fetch 核对 origin/develop 仍为 `cd6c82b1995e9c0fc0007b790e2b24a47aaf0fa9`，origin 功能分支与修订基线一致。未新建分叉、回退历史或合并 develop。

**实际被测修正代码提交：`91da6e29198b48cb1984e657272af93e276a220d`。** 代码/测试先提交，再从该提交运行完整回归；之后只有本次 SSOT、计划和报告文档改动。依赖、锁、初始化器、Pi 声明补丁未修改。后续证据提交不冒充被测代码 SHA。

修正前本地复核实际 HEAD 为 `d3bb551fa83dc4bcfe4b67a74c2ff1025ca42d2d`，其代码与 `0e9a01a` 相同（后者之后仅有文档提交）；失败证据记录该实际 HEAD。

原审核目录为用户提供的 `tmp/Pi_Workbench_B_IPC_Review_0e9a01a`，未修改其资料。13 项 MANIFEST 摘要以及 5 个源文件 Git blob/字节与原代码 `0e9a01af0b91cdda096d30159f18734ca6504ced` 匹配。原作者在 Linux/Node 22 上做的是合成持久状态诊断，明确没有实际 Pi/进程终止证据；本地复核补足目标平台。

持久、脱敏机器摘要见 [输入与命令结果](review-b-ipc-inputs.json)。原始输出在忽略的 `.artifacts/b-ipc-review-d3bb551/`（修正前复核）和 `.artifacts/b-ipc-fixes/`（修正与回归）；新克隆只需本文与 JSON 即可定位结论，不依赖本机日志。

## 修正前反例与修正结果

| 项目 | 修正前实测 | 修正与新回归 |
|---|---|---|
| R1 / P1 冷恢复旧授权 | 实际宿主 SIGKILL，guardian 收据缺失，重开 SQLite 后 Run 仍 running，pending 旧审批仍可接受；名额并未释放 | recover 先按旧 epoch 原子 fencing，再检查清理证据。真实 pending/approved/executing 三个窗口均撤销旧许可、旧观察与领取被拒，Run unknown；缺证据继续阻断已排队的新 Run。当前 epoch 不被误失效，重复恢复不重复发布事实 |
| R2 / P2 已登记成果变化 | 真实 Pi write/宿主成果登记提交后 SIGKILL；实际 guardian 收据齐全，随后删除/修改文件，恢复报 ENOENT / artifact_content_mismatch，Run unknown | reconcileArtifact 按原 Run/Operation/绑定/目标/摘要复用已提交 Artifact。删除/修改/不变三分支均可结算失败 Run；预览仍 missing/changed/ready，文件和 mtime 不被重写，新排队 Run 可派发 |
| R3 / P2 枚举转换 | JSON 数组 tool=[write]、kind=[idle]、code=[protocol_failed] 经 String 检查通过，返回仍为数组 | 原始类型必须为 string，再查枚举。三类字段覆盖合法字符串及数组、嵌套数组、对象、null、数字、布尔、空串、未知值；不引入 schema/RPC 框架 |
| R4 / P2 首次落盘引用丢失 | 实际 Pi 在 ready 后追加明确合成 user/assistant 并落盘，Worker SIGKILL；原文件字节保留，但下一 Run 引用 null | Pi 预分配路径在 Runtime factory 创建 Session 前经宿主持久确认。首次创建与 newSession 替换后落盘均通过真实 kill、库重开、原文件核验和下一实际 Worker 恢复；没有扫描最新文件、手写 JSONL 或调用模型 |

修正前 9 项局部诊断直接导入完整当前 checkout，无原材料的 loader 替换；另有 6 项真实进程诊断（R1 两项、R2 两项加正常对照、R4 一项）。这些检查当时期待错误行为，得到预期诊断不等于产品通过。R1/R3 没有证明物理越权、任意工具执行或执行名额错误释放，不能扩大漏洞结论。

保留负向门槛：未登记但 succeeded 的成果被修改仍阻断；unknown 操作遇第三种文件版本仍阻断；缺清理收据不结算；历史成果恢复的错误绑定/目标被拒。正常 recordArtifact 的首次登记/重核语义不放宽，安全预览仍检查当前文件。

## 原生引用与所有权

Pi 仍负责 SessionManager、AgentSessionRuntime、Session JSONL/树和 write/edit 工具实现。新增只在已有 Core/Supervisor/Runtime 上补冷恢复、成果恢复端口和有限引用握手；Renderer 没有新增自由路径或 execute-anything 命令。

使用 Context7 阅读 [Pi 官方 SDK 文档](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md)，以实际安装的 **0.87.0** 根级公开导出、发行声明与运行结果为采用依据；main 文档不作为版本锁。SessionManager.create/open/getSessionFile 是已导出类的方法，createAgentSessionRuntime 是根级函数；未 deep-import 内部源码或修改上游运行时。

Worker 取得 Pi 分配的路径后，使用本项目 IPC v2 的 session-reference 请求；宿主检查实际通道、绑定、批准目录与文件形态，在 SQLite 提交后按 requestId 确认。Worker 等待确认，关闭会使等待失败，迟到确认不能继续创建；after-ready 的 newSession 也复用同一 factory。登记文件引用并不表示 Session 已创建或发布。

schema v3 仅在既有 Thread 原生引用旁增加 native_persisted，表示宿主已观察到落盘。宿主 ready/closed/恢复检查更新它，同路径不可降级。尚未落盘的明确路径用公开 Pi.open 保持路径、恢复为空 Session，产品请求意图仍在 Run.input；已知历史文件缺失会拒绝恢复/启动，不静默新建空历史。测试包含 v1/v2 到 v3 的前向迁移、确认前宿主强杀、尚未落盘的第二 Run、已知文件被删的冷恢复/下次启动，以及越界和未登记引用拒绝。库不支持降级供旧运行时使用。

冷启动入口的前提仍是独占 App Server 已接管产品库，并在开放命令前执行 recover。旧授权 fencing 与物理清理证明分开；不以逻辑失效宣称进程已经退出。既有 guardian 仍独立清理固定进程组，Worker 仍无产品库访问能力。hostClean 不从 Worker 输入取得。

## 平台、命令与结果

实测 macOS 27.0（26A428）、机器/Node arm64、Rosetta=0；Node 24.21.0 / npm 11.19.0、Git 2.55.0、项目 Python 3.14.7、Pi 0.87.0。使用已有项目工具链和唯一锁。包测试离线复用已准备的 A3 npm cache 与合成本地 Git 输入。

SDK 测试使用现有启动器：独立临时 workspace/HOME/agentDir、空内存凭据、批准空资源/合成资源、白名单环境、网络 tripwire；实际 Worker 使用 macOS 文件/禁网规则。普通 fs 与 Node SQLite 的测试宿主库读/创建拒绝仍通过。真实模型调用 **0**，没有用户真实数据库或 auth.json/keychain。

下列命令均使用项目 Node bin 在 PATH；完整文档检查额外加入项目 node_modules/.bin。SDK/Worker 子进程重新构造环境，不继承 Provider 凭据。

| 实际命令 | 结果 |
|---|---|
| .venv/bin/python scripts/check-ssot.py | 60 项通过 |
| .venv/bin/python scripts/test-tools.py | 15 项通过 |
| .venv/bin/python scripts/check-docs.py --structural-only | 结构检查通过，startup 27 个摘要保持 |
| .venv/bin/python scripts/check-docs.py --typecheck | 7 类检查通过，含原示例/协议类型 |
| npm run typecheck | 通过，严格声明补丁与编译检查 |
| npm run test:pi-types | 10/10 |
| npm run test:pi-probe | 15/15，保留 F01 |
| npm run test:pi-tools / test:pi-shell | 19/19、4/4 |
| npm run test:pi-resources / test:pi-packages | 12/12、8/8 |
| npm run test:pi-auth | 18/18，保持同 provider 单账户 |
| npm run test:product-core / test:product-sdk | 20/20、5/5 |
| npm run test:product-worker | 48/48，含单元、明确合成 wire 与真实进程检查 |
| .venv/bin/python scripts/bootstrap.py --offline | 连续两次退出 0 |
| .venv/bin/python scripts/bootstrap.py --app --offline | 连续两次退出 0，禁 lifecycle scripts，仅固定声明补丁；随后 typecheck 通过 |
| node <repo>/scripts/run-product-worker.mjs --demo allow/deny/cancel/crash | 四场景分别在独立 cwd 退出 0 |
| node <repo>/scripts/run-product-worker.mjs | 初始化后独立 cwd 重跑 48/48 |

allow=completed/succeeded；deny=failed/denied 且无成果文件；cancel=cancelled/failed 且无成果文件；crash=先 unknown，对账后 failed/succeeded，原 Operation 成果无重写。新增测试全部接入原 test:product-worker，没有另起产品执行引擎或新 CLI。

## 失败、更正与未覆盖项

- 原复核的第一轮真实进程补测两项遇到组查询 EPERM。复核器改为继续等待，仍仅 ESRCH 表示组已消失；未将 EPERM 当成功，原失败输出保留。
- 本次早期新增成果回归有测试夹具问题：普通 JSON 对象与 SQLite 无原型行的严格比较，以及宿主过早写 checkpoint。改为比较全部字段和在实际 artifact 提交回调处暂停，不削弱业务断言。
- 新增第二 Run 的夹具误复用前一次审批 requestId；正确等待第二个 Operation 并使用独立请求 ID 后通过。产品的幂等冲突检查未放宽。
- 临时全量验证器过滤 PATH 时误选 /usr/bin/git，A3 Git 测试被 OS 拒绝读取 Xcode 的 libxcrun（其余 7 项通过）。验证器改用本机已有 /opt/homebrew/bin/git，A3 8 项与最终完整回归均通过。没有安装/修改 Xcode、全局 Git 或放宽 profile。

当前四项限定修正没有未解决阻塞。未验证：Windows/Linux 受限模式、任意恶意/setsid 后代、断电/系统重启、文件与 SQLite 原子性、所有 Fork/import 落盘窗口、真实 OAuth/模型、UI、打包 ABI、新克隆和 CI。若文件在宿主首次观察前写入又被外部删除，persisted 标记不能证明不可见历史；本轮不引入文件系统事务或第二份历史树。

## SSOT 与停止点

新增失败复核证据保留实测 HEAD d3bb551（代码 0e9a01a），并另记本提交的 review/static/sdk/platform 成功证据；旧 30 项结果保留为历史范围。旧报告“缺证据均已 unknown”和“没有未解决阻塞”需按本次复核限定，不拿旧测试覆盖冷启动或 ready 后首次落盘。CORE-01/02/03、ART-01 等保持 in_progress，M0-UI/M0-SDK/M0-Pi 保持 pending。

NEXT_STEPS 唯一当前项为 C 最小桌面界面及安全正文/工具摘要投影。没有改 docs/startup/、安装 Electron/React、调用真实模型、发布包或合并 develop。推送与独立远端 SHA 读回由最终交付记录说明。
