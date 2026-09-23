# 开发环境、检查与发布

当前实现决策以 [复用优先 SSOT](ssot/README.md) 为准。修改当前文档或 Backlog 后运行 `python scripts/check-ssot.py`；该检查只验证文档/JSON一致性，不安装或测试 Pi。

## 1. 当前初始化范围

默认模式只初始化文档检查环境，不安装 Pi、Electron、Node 工具链或系统包。需要 Python 3.10+；Git 和 OpenSSH 只在克隆/发布时需要。显式 `--app` 模式见第 9 节，保留默认文档流程。

### macOS / Linux

```bash
bash scripts/bootstrap.sh --offline
.venv/bin/python scripts/check-docs.py --structural-only
.venv/bin/python scripts/check-ssot.py
```

### Windows

```powershell
py -3 scripts/bootstrap.py --offline
.\.venv\Scripts\python.exe scripts\check-docs.py --structural-only
.\.venv\Scripts\python.exe scripts\check-ssot.py
```

也提供 `scripts/bootstrap.ps1` 入口；不改变系统执行策略。默认创建/复用 `.venv`，不修改全局 Git、SSH 或系统权限。默认没有网络依赖安装。

## 2. 完整示例检查

有网络时显式安装固定的文档测试依赖：

```bash
python scripts/bootstrap.py --install-test-deps
```

macOS/Linux：

```bash
.venv/bin/python scripts/check-docs.py
.venv/bin/python scripts/check-ssot.py
.venv/bin/python scripts/test-tools.py
```

Windows 使用 `.\.venv\Scripts\python.exe` 作为解释器。

离线安装必须已有覆盖目标平台的 wheelhouse：

```bash
python scripts/bootstrap.py --install-test-deps --offline --wheelhouse /absolute/path/wheels
```

脚本在离线模式下使用 `--no-index`。依赖清单是本次验证环境已有版本的精确记录，不表示最新版本，也未验证所有版本在 Python 3.10、macOS 与 Windows 上的安装可用性。正式双平台 CI 应进一步验证并记录依赖下载摘要。

## 3. TypeScript 协议检查

已经安装 `tsc` 时运行：

```bash
python scripts/check-docs.py --typecheck
```

脚本不会通过 npx 或 npm 自动下载编译器；请求了类型检查但不存在 tsc 时会失败。类型检查不运行协议代码，也不是 Pi 集成测试。

## 4. 原资料不受测试污染

`docs/startup/MANIFEST.sha256` 覆盖 27 个原文件。检查器先验证摘要，将来源复制到临时目录，再执行原 `tests/validate.py`。其输出和生成报告留在临时副本；新汇总写在 `.artifacts/validation.json`，结束后再次核对原始摘要。

本地 Markdown 链接只检查文件路径是否存在，不校验锚点或远端网页在线状态。凭据检查只覆盖常见敏感文件名和私钥标记，不证明仓库没有其他形式的秘密。

## 5. 恢复 Git bundle

```bash
git clone --branch main pi_workbench_ready.bundle pi_workbench
cd pi_workbench
git remote set-url origin git@github.com:Jack-Agilian/pi_workbench.git
```

源码 ZIP 不含 `.git`，不能直接保留提交历史。Git bundle 才是本次提交的可恢复交付。

## 6. 使用已授权 deploy key 发布

发布脚本只允许目标仓库 `Jack-Agilian/pi_workbench`，密钥必须位于仓库外。需要系统具备 Git/OpenSSH、可访问 GitHub，并且 deploy key 已获目标仓库写权限。

```bash
python scripts/publish.py \
  --key /absolute/path/github_deploy_key \
  --known-hosts /absolute/path/verified_known_hosts \
  --branch main --check-only
```

上述只检查本地配置及远端读取，不写仓库，也不证明写权限。确认无误后去掉 `--check-only` 才执行推送。

`known_hosts` 必须是你独立核对过主机身份的文件。脚本不执行未核验的 ssh-keyscan、不关闭主机校验、不自动接受首次主机密钥。没有 SSH 客户端时立即失败，不尝试修改系统环境。

脚本禁止脏工作区、目标 remote 不匹配、非快进历史覆盖与强制推送；只在推送后重新读取的远端 SHA 与本地一致时报告 `pushed_and_verified`。它不提交文件，不设置真实用户身份，也不修改分支保护。

## 7. 当前平台验证范围

原文档交付的脚本验证来自 Linux 容器。本轮 A0/A1 另在 macOS 27.0 arm64 验证文档/应用初始化及零模型 Session 探针；Windows 入口尚未实测。PowerShell、ConPTY、Job Object、Keychain 和安装签名未被测试。不能把本文的跨平台入口存在理解为应用已支持双平台。

## 8. SSOT 的推进与 A0 运行时记录

字段和证据规则见 [SSOT 维护规则](ssot/maintenance.md)。`check-ssot.py` 校验动态任务/能力、两类依赖的联合无环性、合法状态和证据引用；它不联网核实 Issue、CI、包签名或测试真实性。测试中的合成证据只存在于内存，不写入正式清单。`docs/startup/` 摘要继续严格保持不变。

A0 实施完成后，分别记录开发 Node、打包后的 Worker 可执行文件/Node 版本、Electron 版本及 ABI、OS/CPU、Pi 精确发行包及完整性、锁文件、安装脚本白名单和原生模块构建证据。不要以开发机 Node 版本推断 Electron 内部或独立 Worker 的运行时兼容性。当前文档初始化器仍不安装应用工具链。

M0-UI、M0-SDK、M0-Pi 分别在 `backlog.json.milestones` 记录；未取得相应证据保持 pending。新增测试报告应记录被测提交及工作区差异、命令、平台和范围；忽略的 `.artifacts/` 仅作即时输出，要供后续完成声明引用时，提交脱敏摘要或使用可访问的 CI 结果地址。

## 9. A0/A1 应用探针（显式模式）

精确运行时：Node **24.21.0** LTS，随官方二进制附带 npm **11.19.0**。两个 Pi 直接依赖均为 **0.87.0**；TypeScript **7.0.2**、Node 类型 **24.13.6**、用于满足可选类型引用的 MCP SDK **1.30.0**。根 `.node-version`、package.json 与唯一 package-lock.json 约束版本；不依赖全局 Pi，不使用 latest 标签安装。项目 `.npmrc` 始终禁用 lifecycle scripts，显式 npm run 仍执行指定脚本。

```bash
# 默认文档环境不变
bash scripts/bootstrap.sh --offline

# 有准确版本的 Node/npm 时，安装锁定依赖并显式应用已审核的声明补丁
.venv/bin/python scripts/bootstrap.py --app

# macOS/Linux：显式下载官方精确 Node 到被忽略的 .artifacts/toolchains
# 下载按官方 SHASUMS256 校验字节；未独立验证发行签名。该下载模式需要 Python 3.12+。
.venv/bin/python scripts/bootstrap.py --app --install-node

# 以本轮 macOS arm64 为例，仅在当前 shell 选择项目内 Node；不改全局设置
export PATH="$PWD/.artifacts/toolchains/node-v24.21.0-darwin-arm64/bin:$PATH"
npm run check:environment
npm run typecheck
npm run test:pi-types
npm run test:pi-probe
```

Pi 0.87.0 原始声明的严格检查失败复现及候选见 [ADR-A0](ssot/adr-a0-pi-types.md)。应用初始化在禁用 lifecycle scripts 的 npm ci 后，显式用 Git apply 应用固定的 41 文件声明补丁（两个副本）。补丁只改 JSON 类型导入；strict、NodeNext 和完整声明检查保留。`npm run typecheck` 只核验补丁，不修改依赖；`npm run test:pi-types` 验证重复应用、异常拒绝，以及正确/错误 SDK 入参的编译结果。

若手动运行安装命令，须显式补一步；不用 postinstall 自动执行：

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run patch:pi-types
```

补丁版本、SRI、文件摘要不匹配时立即失败，按 ADR 重新审核。不要删除门槛或开启 skipLibCheck。Session 运行探针独立执行，不隐含类型通过。

初始化器从自身路径定位仓库，可从任意目录执行；已有 Node 和 npm cache 时 `--app --offline` 可重复运行 npm ci。它不修改锁文件、全局 Git/SSH、全局 Node、用户 Pi 配置或文档 `.venv`。Windows 可自行提供精确 Node/npm，自动 Node 解包路径仅实现 macOS/Linux；未声称 Windows 实测。

依赖获取阶段可以联网；SDK 子进程从空环境构造测试所需变量，HOME/agentDir/workspace/sessions 都在自动清理的独立临时目录。公开 ResourceLoader 直接提供空集合，空内存凭据与内存 settings/model store 从创建前注入，不调用默认资源发现。通过 Node 权限限制文件读取、子进程、worker、native addon（SQLite 的例外与 OS 补充规则见第 13 节）；预加载网络 tripwire 拦截 fetch/HTTP/TCP/DNS/UDP 等入口，请求即使被库捕获也让进程失败。macOS 额外使用系统 sandbox-exec 拒绝网络，不回退到开放网络。它用于受信任代码的离线测试，不是恶意插件沙箱。

```bash
# A0：可联网的下载审计，与 SDK 探针分开
.venv/bin/python scripts/verify-pi-release.py

# 全部历史示例检查使用项目安装的 tsc，不自动下载
export PATH="$PWD/node_modules/.bin:$PATH"
.venv/bin/python scripts/check-docs.py --typecheck
```

下载审计对五个直接依赖比较 registry/lock/SRI/实际 tarball 字节，以及安装文件；两个 pi-ai 副本的声明分别验证修改前后摘要，其余文件验证原始字节（package.json 核对语义身份）。默认输出在 `.artifacts/a0-a1/`，可用 `--output-dir .artifacts/<目录>` 保存新一轮结果。SDK tests 仅写入明确的合成记录，不调用 prompt/Provider；没有真实模型 fixture。订阅重放与注入故障也明确是合成测试。A0/A1 的阶段结果不代表 CORE-02、M0-SDK、M0-Pi 完成；本轮不进入 A2。

本轮可定位结果：[A0/A1 收尾报告](validation/a0-a1-closeout-2026-09-22.md)、[含声明补丁的完整性记录](validation/a0-a1-closeout-release.json)；[首次验证](validation/a0-a1-2026-09-22.md) 保留历史失败。报告引用先提交后实测的代码 SHA；文档提交不冒充被测代码提交。

## 10. A2 工具探针

沿用第 9 节初始化和精确依赖，无额外安装。使用同一项目 Node/npm：

```bash
npm run typecheck
npm run test:pi-tools
npm run test:pi-shell
npm run test:pi-probe
```

`test:pi-tools` 使用真实 Pi 文件工具、独立合成文件及明确标记的合成 BashOperations，禁止子进程。`test:pi-shell` 在 macOS 使用 Pi 官方本地 Bash 后端，执行固定测试命令，验证已运行的进程取消和超时；该模式额外启用子进程并套用 OS 网络/文件边界。其他平台明确失败，不退回开放环境。两种模式均从空环境白名单创建子进程，不读取用户 Pi 设置/凭据，不调用模型。

审批回调、不可复用操作身份、Operations 和观察只用于探针；测试保留 Pi 的参数准备、schema、元数据、diff、裁剪与结果形状。完整采用边界、辅助 I/O 与竞争窗口见 [A2 边界记录](validation/a2-boundaries.md)。原始运行日志位于忽略的 `.artifacts/a2/`。

A2 的实际被测 SHA、命令和新副本结果见 [脱敏验证报告](validation/a2-2026-09-22.md)，采用文件摘要见 [输入记录](validation/a2-inputs.json)。

## 11. A3 受控资源与包探针

沿用已有项目工具链和应用依赖，默认文档初始化不变。资源测试不需要下载新的测试输入：

```bash
npm run typecheck
npm run test:pi-resources
```

包测试使用实际 npm/Git，只安装指定数据输入和合成本地 Git 包，从不导入这些包为扩展。先在独立、可联网的准备阶段核验 registry/SRI/字节并让 npm 建立缓存，再运行禁网 SDK 测试：

```bash
npm run prepare:pi-packages
npm run test:pi-packages
```

准备入口仅写 `<repo>/.artifacts/a3/package-inputs/`，可重复执行；测试入口不会自动补下载，缺缓存即失败。清单位于 [测试输入](../packages/pi-adapter/package-fixtures.json)，不改应用依赖或根锁。测试每次复制缓存到新的受管理临时目录，使用空 HOME、临时 npm/Git 配置、--offline 和 --ignore-scripts，不继承账户环境或真实全局配置。

`test:pi-packages` 目前要求 macOS 和本机已有 Git；系统 profile 对 npm/Git 子进程限制文件与网络，失败不回退。npm 需要的祖先 metadata 权限、只读快照限制和默认资源加载器的隐式安装复现见 [A3 边界](validation/a3-boundaries.md)。测试未授权真实模型、未知扩展或用户包脚本。

结果见 [A3 报告](validation/a3-2026-09-22.md) 和 [完整性摘要](validation/a3-inputs.json)。原始输出位于忽略的 `.artifacts/a3/`；本轮停止于 A3，A4 与三个 M0 Gate 尚未完成。

## 12. A4 凭据与模型探针

继续使用第 9 节的工具链，无新依赖或下载 fixture：

```bash
npm run typecheck
npm run test:pi-auth
npm run test:pi-shell
```

`test:pi-auth` 在既有禁网隔离启动器内运行 16 项测试。显式内存 CredentialStore/modelsStore、无 modelsPath、空资源/settings；只批准测试内合成 Provider，其 login/refresh 回调不执行 OAuth 协议，stream 一旦执行即失败。临时 auth/models 文件是明确标记的负向合成输入，绝不使用用户文件或 Keychain。

SDK 与 Shell launcher 父进程主动放入合成环境 canary，验证白名单子进程没有继承；捕获输出若出现该 canary 就抑制输出并失败。状态投影不透传凭据、上游 source/metadata 或异常；这不是完整产品 Renderer/日志系统。详见 [A4 报告](validation/a4-2026-09-22.md)、[输入摘要](validation/a4-inputs.json) 和 [生命周期边界](validation/a4-boundaries.md)。原始输出在 `.artifacts/a4/`。真实 OAuth、系统存储/flush、Windows/Linux 未验证，三个 M0 Gate 保持 pending。

## 13. B 最小产品核心

沿用第 9 节工具链和锁文件，无新依赖。以下两套测试当前必须在 macOS 运行：

```bash
npm run typecheck
npm run test:product-core
npm run test:product-sdk
```

`test:product-core` 用真实 SQLite 和文件系统验证产品命令/事务/状态/事件/成果；Worker、清理和崩溃输入明确为合成。`test:product-sdk` 复用真实 Pi 原生保存/重开、Runtime 替换、公开 write 和 A2 批准接缝，不调用模型。Adapter 只传固定身份及有限观察，产品宿主独自写 SQLite；这仍是同进程模块测试，不是已运行的 App Server/Worker 服务。

固定 Node 的 SQLite 入口目前是 Stability 1.2 候选，且已实测其文件访问不受 Node 文件白名单约束。B 启动器因此强制附加 macOS 文件规则，用真实合成 DB 验证禁止目录不可读/不可创建文件；Node 其他权限、网络 tripwire 和空环境隔离仍保留，失败不回退开放环境。当前不支持在其他平台运行 B 测试，详细限制见 [B 边界](validation/b-boundaries.md)。

[脱敏报告](validation/b-2026-09-22.md) 引用真实被测代码 SHA，记录 17+5 项测试、前序回归、重复初始化及独立副本重跑；[输入摘要](validation/b-inputs.json) 可在新克隆定位。原始输出位于忽略的 `.artifacts/b/`。完整 Worker/IPC、失败恢复、资源/权限绑定和三个 M0 Gate 尚未完成。

## 14. A4 审核后的回归

运行 `npm run test:pi-probe`、`npm run test:pi-resources`、`npm run test:pi-auth` 分别包含 F01/F02/F03 回归，当前为 15、12、18 项；仍沿用既有隔离启动器，未新增依赖。路径测试使用 Node path.win32/posix，不能据此报告 Windows 实机通过。认证状态先用 createAuthViewReader 登记完整账户白名单，同 Runtime 只绑定一次、同 provider 单账户。实际被测提交、命令与完整回归见 [复审报告](validation/review-a4-2026-09-23.md)。

## B-IPC：真实子进程与四场景驱动

沿用第 9 节的项目 Node/npm 和初始化，macOS 上执行：

```bash
npm run typecheck
npm run test:product-worker
npm run demo:product-worker -- allow
npm run demo:product-worker -- deny
npm run demo:product-worker -- cancel
npm run demo:product-worker -- crash
```

驱动复用 ProductCore 命令、真实 SQLite、同一 IPC/Worker 和已注册 Pi write/edit。输出明确标记 SYNTHETIC；没有模型调用。每次使用独立临时 workspace/agentDir/Session/产品库，结束删除测试临时文件；演示打印生成的 Markdown 和结果摘要。`crash` 在实际文件写入后杀死 Worker，重开产品库仅核验原文件，Run 由 unknown 对账为 failed，已核实的成果仍归原 Operation。

[进程契约](ssot/b-worker-contract.md) 说明权限、监护器与恢复范围。受限 Worker 仅支持当前验证的 macOS/Node 组合，其他平台报错。正常 entry 没有合成开关或模型驱动；测试 entry 的可信组合不能由 Renderer 命令选择。C 将补安全正文/工具摘要展示，当前类型标签投影不是聊天时间线。

B-IPC [审核修正与回归](validation/review-b-ipc-2026-09-23.md) 仍使用同一测试/演示命令，Worker 套件现为 48 项。IPC v2 增加宿主持久确认的 Pi 原生路径；产品库 schema v3 前向迁移原生落盘标记。升级后的宿主和 Worker 必须使用同一协议；不支持将 v3 库交回旧运行时。冷启动独占宿主先 recover，再开放命令；缺清理凭据时授权失效且继续阻断，不能强行释放 Run。
