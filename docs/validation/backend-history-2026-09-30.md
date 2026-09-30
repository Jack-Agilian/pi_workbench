# UI-P2 后端前置与 develop 审核修正（2026-09-30）

## 基线与实际提交

开工时当前工作树为干净的旧detached HEAD；fetch后以实际 `origin/develop@58d3130d9ed480e283434c749e285efd6ba2092d` 新建 `codex/backend-history-safety`，没有回退develop、覆盖未提交内容或操作其他工作树。实施范围来自develop@58d3130审核的R01/R02/R03和双线计划。

- 产品代码/测试/契约：`45e45a5d598771c484926dd82d404f4242761185`。
- 仅补操作分页断言：`8e1b5987d607101fb04df571280e3c75c939efc3`，生产代码与前一提交相同。
- 下方完整回归在实施提交执行；补充断言提交只重跑类型、后端和模型Shell三项相关命令。其间后续SSOT文档处于本地修改，不冒充新代码实测。
- 环境：macOS 27.0、机器/Node均arm64、Rosetta=0；Node24.21.0、npm11.19.0、Python3.14.7、Git2.55.0、Pi0.87.1、Electron44.4.5。
- 使用既有固定Node；当前工作树独立node_modules/.venv/dist。依赖版本/锁/声明补丁不变，没有全局升级。

[脱敏命令与源文件摘要](backend-history-inputs-2026-09-30.json)可在新克隆定位；原始日志在本机忽略目录 `.artifacts/backend-history/`，不作为SSOT唯一证据。完整可执行命令以package scripts为准，不依赖个人绝对路径或启动cwd。

## 本轮新增能力与复用

1. **旧会话重新检查工作目录**：重启后按当前保护目录重新准入，不隐式换根；保护范围相同、父/子相交及目录被重定向时拒绝。尚未派发的请求以失败及审计记录收口，不留下没有Worker的starting占位。临时凭据文件选择先保护父目录再读文件，路径元数据重启沿用，无秘密值。
2. **多工具任务持续运行**：展示消息只保留各类最新序号，重复/迟到消息不覆盖新正文；独立保留操作请求/回复去重事实和128项控制上限。命名空间与实际通道/binding共同检查，取消/关闭不因控制缓存额度被吞掉。没有增加LLM次数上限。
3. **分批读取已有历史、工具记录与成果**：固定三类SQLite查询，最多32条且完整页不超过256000 UTF-8字节。独立活动快照保持当前审批可读；文件只在选中后预览。跨页固定插入上界，单页snapshotSeq是读取时当前事件序号，不承诺跨请求冻结可变状态。
4. **两线开发数据隔离**：`--dev-profile=backend`/`frontend` 使用各工作树自己的应用数据、数据库和原生Session目录；仅允许离线模式，正式配置/费用账本不复制。

Pi继续拥有循环、工具、Session/JSONL和Provider；只查询已有产品投影。分页采用SQLite官方查询模式，目录采用Electron原有userData/单实例锁。pi-gui/OpenPi仅作本轮结构参考，没有移植新社区代码、新依赖或通用框架。来源及不直接移植原因见 [契约](../ssot/backend-history-contract.md)；OpenPi当前README已转为main监督sidecar，已纠正旧资料描述。Context7结果经实际安装包声明核对，不把别的Pi组件或main源码当成本包公开API。

## 定向证据及范围

- R01：真实临时数据库、关闭/重开和真实Worker；同目录/祖先/子目录保护相交阻断，旧Thread目录不重绑，正常旧目录仍可派发并拒绝审批。默认受管理目录只允许精确例外，保护子目录及symlink变化阻断。queued测试明确是“持久化后未派发”合成生命周期，不冒充进程崩溃清理。
- R02：实际Pi发行包/受限Worker、真实Bash/write，明确合成HTTP回复。16次Bash及16次混合操作各17次合成模型回调，全部成功且文件内容核对；20项套件还保留原限额/取消/结果丢失回归。另一个真实子进程是**合成协议生产者**：300余条展示消息、旧消息、重复同一控制请求、取消，无重复操作；它不是Pi模型fixture。5000条水位检查属于纯逻辑测试。
- R03：真实SQLite60 Run，每Run四段2000中文字符，旧全量响应仍超过1.2 MB并被原IPC拒绝。分页经实际HostClient逐页取齐60个唯一Run；宿主重连首屏一致，翻页期间新增Run不混入旧页链，事件从首屏水位补读，当前待审批操作独立可见。补充用真实16操作验证工具记录分四页无丢失/重复，且活动操作页走实际IPC。
- 成果：真实文件与登记元数据，分页不读正文；ready/changed/missing和原审计不变。此用例的Run/清理输入明确合成，不作为Worker清理证据。
- profile：两个实际离线Host并发，PID不同，同一requestId分别产生各自Thread，重连后数据互不串用。随后在8e1b598另外启动两份实际开发launcher/Electron/Host：各自browser单实例锁、SQLite及state目录存在，两份启动器同时存活且SIGTERM均正常退出；没有人工交互验证，不宣称任意进程或跨平台隔离。

## 集中执行结果

全部命令退出0，真实模型调用**0**。依赖下载与离线SDK执行分阶段；现有测试使用空凭据、受管临时目录和网络tripwire，模型网络测试仅本机loopback/OS限制，不访问真实Provider。

| 实际命令 | 结果 | 被测提交 |
|---|---|---|
| `npm run typecheck` | passed（见范围说明） | `45e45a5` |
| `npm run test:backend-history` | 13 passed | `45e45a5` |
| `npm run test:product-model-shell` | 20 passed | `45e45a5` |
| `npm run test:product-core` | 20 passed | `45e45a5` |
| `npm run test:product-sdk` | 5 passed | `45e45a5` |
| `npm run test:product-worker` | 51 passed | `45e45a5` |
| `npm run test:product-shell` | 28 passed | `45e45a5` |
| `npm run test:model-integration-offline` | 45 passed | `45e45a5` |
| `npm run test:product-file-agent` | 34 passed | `45e45a5` |
| `npm run test:pi-probe` | 15 passed | `45e45a5` |
| `npm run test:pi-tools` | 19 passed | `45e45a5` |
| `npm run test:pi-shell` | 4 passed | `45e45a5` |
| `npm run test:pi-resources` | 12 passed | `45e45a5` |
| `npm run test:pi-auth` | 18 passed | `45e45a5` |
| `npm run test:pi-types` | 10 passed | `45e45a5` |
| `npm run test:desktop` | 20 passed | `45e45a5` |
| `npm run test:model-network` | passed（见范围说明） | `45e45a5` |
| `npm run test:model-config` | passed（见范围说明） | `45e45a5` |
| `npm run test:model-resume` | 14 passed | `45e45a5` |
| `npm run test:file-acceptance` | 25 passed | `45e45a5` |
| `npm run test:desktop-ui` | passed（见范围说明） | `45e45a5` |
| `npm run test:desktop-shell` | passed（见范围说明） | `45e45a5` |
| `npm run test:desktop-model` | passed（见范围说明） | `45e45a5` |
| `npm run test:desktop-file-agent` | passed（见范围说明） | `45e45a5` |
| `npm run test:desktop-agent-shell` | passed（见范围说明） | `45e45a5` |
| `npm run test:desktop-shutdown` | passed（见范围说明） | `45e45a5` |
| `npm run test:pi-packages` | 8 passed | `45e45a5` |
| `npm run typecheck` | passed（见范围说明） | `8e1b598` |
| `npm run test:backend-history` | 13 passed | `8e1b598` |
| `npm run test:product-model-shell` | 20 passed | `8e1b598` |

`test:model-network` 检查实际loopback、重定向拒绝、Worker SQLite/网络拒绝；`test:model-config` 包含临时/持久合成凭据、重复初始化、实际Electron启动/重连。Electron UI覆盖允许/拒绝/取消/崩溃及确认丢失，Shell覆盖允许/拒绝/取消，模型桌面三种模式使用合成Provider；退出矩阵为24个实际Electron/宿主/固定进程组场景。它们是程序化检查，不是本轮人工IME、三尺寸体验或真实模型桌面验收。

另外实际执行：`python3 scripts/bootstrap-app.py --offline`，随后 `python3 scripts/bootstrap.py --app --offline` 重复初始化；lifecycle scripts始终禁用，仅单独执行已有审核声明补丁。文档默认入口 `python3 scripts/bootstrap.py --offline` 重跑通过；本工作树用 `python3 scripts/bootstrap.py --install-test-deps` 安装仓库固定文档依赖。`npm run prepare:desktop -- --offline` 前后两轮用已验证缓存准备Electron；`npm run prepare:pi-packages` 单独向官方registry获取并校验3个安装测试输入，再执行禁网包测试8项。没有完整新克隆验收，不将当前工作树初始化夸大为新克隆。

## 失败、未验证与停止点

开发中的首次定向测试有三类测试输入问题：默认workspace被重定向已由ProductCore构造阶段拒绝，原断言误等到启动阶段；未节流的合成生产者触发既有IPC背压；缺少done输入的合成关闭被宿主正确保留unknown。分别修正断言位置、生产者节奏和完整协议输入，没有增大队列、放宽生产清理断言。上述发生在首个代码提交前的工作副本，不能写成原develop回归失败或最终提交通过记录。最终两提交的上表命令没有失败。额外双Electron启动核查的第一版临时脚本错误地在profile根找Local State，实际main既有路径为profile/browser；两实例已正常退出。改为核验实际browser/SingletonLock后重新启动两实例通过，没有修改生产代码。该核查仅启动/存储/正常退出，不替代GUI交互测试；其中一次启动日志有sandbox_extension_issue_file警告，未据启动通过扩大系统沙箱声明。

Renderer/style未修改，旧thread全量入口仍保留上限，只有前端采用新API后才能完成长历史体验。home会话目录和原生Session全量正文尚未分页；未实现虚拟列表、PTY、Windows、完整沙箱、任意文件系统竞态保护、真实模型续验或生产发行。没有读取/修改用户真实配置、key或费用账本，未合并develop。UI-P2保持唯一当前事项；CORE-03/SEC-02/UI-01/ART-01仍in_progress，MODEL-03/04和M0 Gate保持既有范围。

## Skill评估

本轮是审核修正及首次分页契约落地，接口/验收编排仍在与前端收敛，不适合固化为稳定操作Skill。可重复的定向验证已封装为 `test:backend-history`，输入为固定工具链/当前checkout，输出为隔离临时数据库和测试结果，默认禁真实模型。待前后端共同验收流程稳定后再评估小范围Skill。本次使用的Context7 Skill仍符合resolve→单概念query→实际发行包核对流程，无需修改第三方Skill。

## 文档/秘密与文件检查

在8e1b598加本次SSOT/报告文档差异上实际执行：

| 命令 | 结果 |
|---|---|
| `.venv/bin/python scripts/check-ssot.py` | 60 passed |
| `.venv/bin/python scripts/test-tools.py` | 15 passed |
| `.venv/bin/python scripts/check-docs.py --structural-only` | 5 passed / 2 intentional skipped |
| `.venv/bin/python scripts/check-docs.py --typecheck` | 7 passed / 0 skipped |
| `git diff --check` | passed |

本轮34个变更文件的常见秘密模式扫描0命中，无忽略的临时/构建/数据库或密钥文件误提交；不把有限模式扫描当作完整安全审计。docs/startup、依赖锁、Renderer/style和其他工作树均未修改。未合并develop；新分支推送后另行独立读回SHA，报告不填写尚不存在的文档提交SHA。
