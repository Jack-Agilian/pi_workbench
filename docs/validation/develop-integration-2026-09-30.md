# develop 集成检查（2026-09-30）

用户本轮明确授权“合入 develop 并提交”。远端fetch后develop仍为 `148022b05250cfda824725778e9a056d00cd6830`；`codex/agent-shell-mvp` 为 `34ed62e3fc875c56059eb19c1f02781d72c78bfc`。祖先关系0/20，工作区干净，采用 `git switch develop`、`git merge --ff-only codex/agent-shell-mvp`，保留全部20个提交；没有冲突、重写历史或删除其他工作树/分支。

## 实际被测输入与范围

本次被测提交：`34ed62e3fc875c56059eb19c1f02781d72c78bfc`。合并不产生代码差异；后续文档提交仅同步集成状态、下一步与本报告，不冒充新的代码测试SHA。平台macOS 27.0 arm64，使用项目既定Node 24.21.0 / npm 11.19.0 / Pi 0.87.1；依赖、锁、初始化及docs/startup均未修改。

以下命令本轮集中运行，全部退出0；运行时测试模型输入均为合成，真实模型调用0。即时输出保存在忽略目录 `.artifacts/develop-integration-20260930/`，本报告是跨克隆可定位的脱敏摘要。

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | passed |
| `npm run test:pi-probe` | 15 passed |
| `npm run test:pi-tools` | 19 passed |
| `npm run test:pi-resources` | 12 passed |
| `npm run test:pi-auth` | 18 passed |
| `npm run test:product-core` | 20 passed |
| `npm run test:product-sdk` | 5 passed |
| `npm run test:product-worker` | 51 passed |
| `npm run test:product-file-agent` | 34 passed |
| `npm run test:product-model-shell` | 18 passed |
| `npm run test:model-integration-offline` | 45 passed |
| `npm run test:model-resume` | 14 passed |
| `npm run test:desktop` | 20 passed |

## 集成与未覆盖范围

- M2文件工具、审核修复、显式验收入口、Agent Shell、产品次数缺省不限及Pi strict schema修正进入同一develop。
- 复用Pi公开Session/Provider/工具及既有宿主/Worker链路，本次没有新增运行时代码。
- 既有真实任务证据继续指向 `688150f070797405250bb16ad3dc837bb0ddc64d`，见 [真实任务报告](agent-task-live-2026-09-30.md)。本次不重跑模型，不改本机账户/授权/费用/配置。
- `test:desktop` 是离线测试，不等于本次Electron UI实机冒烟或人工体验；本次未重跑Electron截图、A3包下载/安装、独立Shell平台套件、初始化/新克隆、Windows、PTY或长达30分钟的真实流。
- MODEL-03/04与M0三个Gate保持既有范围；UI-01/02、ART-01保持in_progress。唯一下一步为UI-P2长历史与成果浏览，本次未实施。
- Diff/文件清单检查：无docs/startup改动、无依赖锁变更、无临时目录/用户配置误提交。常见秘密模式扫描命中两份现有测试内明确标注SYNTHETIC的脱敏canary及其断言，不是凭据；此检查不等于完整安全审计。

## 文档与仓库检查

在上述SHA加本次SSOT/计划/报告文档差异上实际运行：

| 命令 | 结果 |
|---|---|
| `.venv/bin/python scripts/check-ssot.py` | 60 passed |
| `.venv/bin/python scripts/test-tools.py` | 15 passed |
| `.venv/bin/python scripts/check-docs.py --structural-only` | 5 passed / 2 intentional skipped |
| `.venv/bin/python scripts/check-docs.py --typecheck` | 7 passed / 0 skipped |
| `git diff --check` | passed |

没有本轮失败。远端发布结果以推送后的独立 `git ls-remote origin refs/heads/develop` 读回为准；本报告不填写尚未创建的收口文档提交SHA。
