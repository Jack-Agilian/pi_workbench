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

精确运行时：Node **24.21.0** LTS，随官方二进制附带 npm **11.19.0**。两个 Pi 直接依赖均为 **0.87.0**；TypeScript **7.0.2**、Node 类型 **24.13.6**。根 `.node-version`、package.json 与唯一 package-lock.json 约束版本；不依赖全局 Pi，不使用 latest 标签安装。项目 `.npmrc` 始终禁用 lifecycle scripts，显式 npm run 仍执行指定脚本。

```bash
# 默认文档环境不变
bash scripts/bootstrap.sh --offline

# 有准确版本的 Node/npm 时，只安装锁定依赖
.venv/bin/python scripts/bootstrap.py --app

# macOS/Linux：显式下载官方精确 Node 到被忽略的 .artifacts/toolchains
# 下载按官方 SHASUMS256 校验字节；未独立验证发行签名。该下载模式需要 Python 3.12+。
.venv/bin/python scripts/bootstrap.py --app --install-node

# 以本轮 macOS arm64 为例，仅在当前 shell 选择项目内 Node；不改全局设置
export PATH="$PWD/.artifacts/toolchains/node-v24.21.0-darwin-arm64/bin:$PATH"
npm run check:environment
npm run typecheck
npm run test:pi-probe
```

严格 `npm run typecheck` 当前会因发行包声明问题失败，详见 [可复现缺口](validation/a0-a1-gaps.md)。不应删除该门槛或开启 skipLibCheck 来宣称通过。Session 运行探针独立执行，不隐含类型通过。

初始化器从自身路径定位仓库，可从任意目录执行；已有 Node 和 npm cache 时 `--app --offline` 可重复运行 npm ci。它不修改锁文件、全局 Git/SSH、全局 Node、用户 Pi 配置或文档 `.venv`。Windows 可自行提供精确 Node/npm，自动 Node 解包路径仅实现 macOS/Linux；未声称 Windows 实测。

依赖获取阶段可以联网；SDK 子进程从空环境构造测试所需变量，HOME/agentDir/workspace/sessions 都在自动清理的独立临时目录。公开 ResourceLoader 直接提供空集合，空内存凭据与内存 settings/model store 从创建前注入，不调用默认资源发现。禁止文件访问范围外读取、子进程、worker、native addon；预加载网络 tripwire 拦截 fetch/HTTP/TCP/DNS/UDP 等入口，请求即使被库捕获也让进程失败。macOS 额外使用系统 sandbox-exec 拒绝网络，不回退到开放网络。它用于受信任代码的离线测试，不是恶意插件沙箱。

```bash
# A0：可联网的下载审计，与 SDK 探针分开
.venv/bin/python scripts/verify-pi-release.py

# 全部历史示例检查使用项目安装的 tsc，不自动下载
export PATH="$PWD/node_modules/.bin:$PATH"
.venv/bin/python scripts/check-docs.py --typecheck
```

下载审计对四个直接依赖比较 registry/lock/SRI/实际 tarball 字节，以及安装文件；输出仅在 `.artifacts/a0-a1/`。SDK tests 仅写入明确的合成记录，不调用 prompt/Provider；没有真实模型 fixture。订阅重放与注入故障也明确是合成测试。A0/A1 的阶段结果不代表 CORE-02、M0-SDK、M0-Pi 完成；本轮不进入 A2。

本轮可定位结果：[A0/A1 验证报告](validation/a0-a1-2026-09-22.md)、[下载完整性记录](validation/a0-a1-release.json)。报告引用先提交后实测的代码 SHA；文档提交不冒充被测代码提交。
