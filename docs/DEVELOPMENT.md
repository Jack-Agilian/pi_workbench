# 开发环境、检查与发布

当前实现决策以 [复用优先 SSOT](ssot/README.md) 为准。修改当前文档或 Backlog 后运行 `python scripts/check-ssot.py`；该检查只验证文档/JSON一致性，不安装或测试 Pi。

## 1. 当前初始化范围

本脚本只初始化文档检查环境，不安装 Pi、Electron、Node 工具链或系统包。需要 Python 3.10+；Git 和 OpenSSH 只在克隆/发布时需要。应用依赖将在 BOOT-03 中核验并固定。

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

脚本在本次 Linux 容器执行；macOS/Windows 的入口和路径分支是实现草案，尚未经两种目标操作系统实测。PowerShell、ConPTY、Job Object、Keychain 和安装签名未被测试。不能把本文的跨平台入口存在理解为应用已支持双平台。

## 8. SSOT 的推进与 A0 运行时记录

字段和证据规则见 [SSOT 维护规则](ssot/maintenance.md)。`check-ssot.py` 校验动态任务/能力、两类依赖的联合无环性、合法状态和证据引用；它不联网核实 Issue、CI、包签名或测试真实性。测试中的合成证据只存在于内存，不写入正式清单。`docs/startup/` 摘要继续严格保持不变。

A0 实施完成后，分别记录开发 Node、打包后的 Worker 可执行文件/Node 版本、Electron 版本及 ABI、OS/CPU、Pi 精确发行包及完整性、锁文件、安装脚本白名单和原生模块构建证据。不要以开发机 Node 版本推断 Electron 内部或独立 Worker 的运行时兼容性。当前文档初始化器仍不安装应用工具链。

M0-UI、M0-SDK、M0-Pi 分别在 `backlog.json.milestones` 记录；未取得相应证据保持 pending。新增测试报告应记录被测提交及工作区差异、命令、平台和范围；忽略的 `.artifacts/` 仅作即时输出，要供后续完成声明引用时，提交脱敏摘要或使用可访问的 CI 结果地址。
