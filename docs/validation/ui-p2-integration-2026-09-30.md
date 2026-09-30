# UI-P2 前端集成（2026-09-30）

用户授权将前端线路合入develop。fetch后远端develop为 `58d3130d9ed480e283434c749e285efd6ba2092d`，前端为 `6884e278bb2d9057a78fa5b74b513a1d0798320e`；祖先关系0/3，采用 `git merge --ff-only 6884e278bb2d9057a78fa5b74b513a1d0798320e`，保留三个原提交，没有冲突或改写历史。

## 用户可用变化

- 审批与成果栏可收起并选择宽度；收起时仍能看到待审批数量、查看入口和当前执行停止。
- 切换会话保留草稿与浏览位置；阅读旧记录时新内容不强制跳到底部，可返回最新。
- 成果展示文件名、路径、来源执行与版本；通过宿主按需核验文件是否一致、被修改、缺失或不可安全读取，不把历史登记当成当前可用。

复用既有React/Electron、产品DesktopApi与Pi执行链路；本次集成本身只更新状态文档，无新增运行时代码/依赖/模型调用。源分支验证范围和两次截图失败保持原SHA，见 [前端报告](ui-p2-frontend-2026-09-30.md)。

## 本轮检查

实际被测提交 `6884e278bb2d9057a78fa5b74b513a1d0798320e`，macOS arm64，项目Node 24.21.0。集成树原有未提交AGENTS.md变更在合并前后逐字节保持，本次未暂存/提交；后续仅叠加本次计划/证据文档。

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | passed |
| `npm run test:desktop` | 20 passed |
| `npm run test:desktop-ui` | passed；实际Electron原四场景及确认丢失/关闭失败回归，新增三尺寸UI-P2用例与截图均通过 |

原始输出在 `.artifacts/ui-p2-integration/`。新增长历史/preview用例是明确合成展示输入；真实模型调用0。既有Pi/Bash/文件/模型离线桌面回归沿用源分支报告，本次未重复运行全部A/B或真实模型。

后端R01/R02、开发profile、有界分页未合入；R03超大历史传输仍待解决。UI-01/02、ART-01保持in_progress，Gate范围不扩大。唯一下一事项收敛为分页接入与前后端组合验收。

## Skill复用评估

本轮集成流程可重复，输入为明确源/目标SHA，输出为已验证远端分支；检查、保留他人改动和禁止重写历史已有仓库规则及项目脚本覆盖。本轮没有形成需要单独维护的新入口，暂不创建重复Skill；后续若形成统一集成脚本，再围绕该稳定入口固化。

文档差异上的检查：`.venv/bin/python scripts/check-ssot.py` 60 passed；`scripts/test-tools.py` 15 passed；`scripts/check-docs.py --structural-only` 5 passed/2有意跳过。diff空白、已知秘密模式与文件清单已检查；docs/startup、依赖锁及特权代码未改。
