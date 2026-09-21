# 本次验证记录

日期：2026-09-21。以下是重新执行的结果，不是照抄原包历史报告。

| 检查 | 实际结果 |
|---|---|
| 原始来源完整性 | 28 个文件保留；27 个 SHA-256 与原始清单一致 |
| 原包示例测试 | 16 通过，0 失败；在临时副本中运行 |
| 仓库辅助脚本单元测试 | 15 通过，0 失败 |
| Markdown 本地链接 | 27 条文件路径通过；未检查网页或锚点 |
| TypeScript 产品协议 | tsc 5.8.3 严格类型检查通过；不执行运行时 |
| 初始化脚本 | 离线模式连续两次成功；同一 .venv 被复用 |
| 原文件测试后状态 | 27 个摘要再次匹配，未改写历史报告 |
| 敏感文件检查 | 常见凭据文件名及 PEM 私钥标记未发现；不是完整秘密扫描 |
| GitHub 写入 | 创建 README 的请求返回 403；没有成功推送 |

## 环境边界

本轮环境是 Linux、Python 3.13.5、Git 2.47.3、Node 22.16.0、TypeScript 5.8.3。

完整 16 项示例检查使用本容器已有的 Python/jsonschema 环境；新建的 `.venv` 只跑了无依赖的结构检查，未通过网络安装依赖。不能将其描述为离线安装了完整依赖或全新环境已经通过完整测试。

本地 bootstrap 使用标准库创建虚拟环境，默认不联网、不修改全局 Git/SSH；`--install-test-deps` 才允许依赖安装。固定依赖版本只记录当前验证组合，没有证明它们在所有目标 Python/操作系统上都能安装。

## 未验证

真实 Pi 模型调用、Electron GUI、macOS/Windows 实机、PowerShell/ConPTY/Job Object/Keychain、操作系统沙箱、安装签名、在线依赖安装、deploy key 的 SSH 身份与写权限，以及成功的远端发布，均未验证。

发布脚本启用严格主机身份校验、无强制推送并读回 SHA，但当前容器缺少 ssh 且无法解析 GitHub，不能据此宣称发布路径已实测成功。

## 证据

运行 `python scripts/check-docs.py --typecheck` 重建 `.artifacts/validation.json`；运行 `python scripts/test-tools.py` 重跑 15 个仓库脚本测试。测试生成物不进入原包或 Git 提交。
