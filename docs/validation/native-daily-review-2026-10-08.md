# 原生桌面接续复验（限定范围）

2026-10-08，macOS 27.0.1 arm64；被测提交 `51a902da8aec4f23187854fcba05858c8e940bc9`，分支 `codex/ui-correctness`，测试时无产品代码差异。项目 Node 24.21.0、Electron 44.4.5。承接[整体验收清单](daily-readiness-2026-10-04.md)，本次 Mac 已解锁，不再将历史锁屏当作当前阻塞。

## 实际执行与结果

使用项目固定 Node，运行两次（首次启动、关闭后重开）：

```bash
npm run demo:agent-shell -- --dev-profile=daily-review-20261004
```

使用已有隔离 profile、SYNTHETIC Provider 和实际 Pi Bash/宿主审批，不加载真实凭据、没有真实模型请求。输入中的自然语言不代表模型理解，执行的是演示驱动固定命令。界面操作通过原生桌面工具；数据库仅以 Python sqlite3 的 `mode=ro` 独立读回，未直接修改产品状态。

| 项目 | 实际观察与核验 |
|---|---|
| 创建与改名 | 从空目录创建会话，改名为“日常检查 A · 已核验”；界面和 SQLite 均确认，title_revision=1。之后实际共有3个会话；重复点击尝试和延迟反馈不能作为“单次点击重复创建”的缺陷证明。 |
| 首轮未批准 | 未及时完成审批，观察到“结果待核实”、阻止新执行；点击“核验并恢复”后显示“未完成”。数据库为Run failed、唯一Bash操作denied。不是人工拒绝按钮验收，也不是正常完成证据。 |
| 两次人工允许 | 第二轮先批准 `printf SYNTHETIC-check; exit 7`，再批准 `printf "# SYNTHETIC shell result\n" > synthetic-shell.md`。实际操作分别failed/succeeded，界面退出码7/0、最终“已结束 · 有工具失败”；Run completed不掩盖工具失败。 |
| 文件 | workspace下synthetic-shell.md为25字节，内容为一行合成标题。SHA-256：`b73a73222ccb4da22c1a297e4cf88201283e9d0b4dee029a962273a35abe78f7`。Bash输出文件不冒充已登记成果。 |
| 关闭与重开 | 原生点击窗口关闭后，启动命令实际退出0；同profile重开，截图出现3个会话及保存后的名称。独立读回3个Thread、2个Run、3个Operation，身份/名称/状态与重开前逐项一致；文件hash、字节数和mtime_ns不变，没有新的执行或重复写入。第二次进程通过本轮启动器SIGTERM收尾，退出0；不冒充第二次原生关闭验收。 |
| 视觉与辅助提示 | 观察到默认两栏、底部输入和权限入口、正文/操作分区、两条命令结果。AX中的“此操作已不再等待审批”经源码和截图核对是sr-only焦点接续播报，不是视觉错误条；未据此改业务逻辑。 |

## 未完成与工具限制

桌面工具多次出现元素失效、`noWindowsAvailable`，以及动作后AX仍返回前一状态；重开后还出现AX只有窗口壳、截图却已显示完整内容的不一致。已重新取状态、按绝对路径绑定、重置操作会话，并清理本轮误启动的默认Electron空窗口，仍未得到稳定连续操作结果。未修改系统权限或使用其他输入技术绕过工具。该现象尚未定位到产品代码，不把工具错误写成产品缺陷，也不把动作已发出当成操作通过。

因此搜索/筛选、双会话草稿保留、长正文/代码复制、跨会话停止、文件成果版本、拖宽/200%及VoiceOver本轮仍未通过原生连续复验。旧自动化证据继续使用原SHA，不重新标成本轮结果。截图/AX是代理操作观察，不是用户人工体验或VoiceOver听读。日志中的sandbox_extension警告保留，不能据此断言全部平台沙箱已通过或失效。

原始启动日志和只读前后快照位于忽略目录 `.artifacts/daily-ui-20261008/`（agent-shell-launch.log、agent-shell-reopen.log、state-before-reopen.json、reopen-comparison.json）；本报告为可在新克隆定位的持久脱敏摘要，SSOT不引用仅本机存在的原始文件。

## 状态与接续

本轮没有新增产品功能；新增的是当前改版的原生创建/改名、人工批准、失败结果展示和关闭重开证据。继续复用原ProductCore、Pi工具、桌面组件和隔离演示入口，没有新模块、依赖或协议。UI-01/02、ART-01保持in_progress，M0 Gate不扩大，未合入develop。

唯一当前事项仍是完整日常工作流与布局体验复审。下一批优先在可稳定操作的桌面补齐上节未完成清单，发现可复现产品问题后集中修正；不重写已通过模块，不用重复模型调用代替UI验收。

Skill评估：本次依赖现场体验判断，输入工具行为尚不稳定，不满足稳定可复用流程条件，不新增Skill。

## 文档验证

实际运行 `.venv/bin/python scripts/check-ssot.py`：60通过；`.venv/bin/python scripts/test-tools.py`：15通过；`.venv/bin/python scripts/check-docs.py --structural-only`：5通过、0失败、2按模式跳过。`git diff --check`通过。仅文档/证据变化，没有重跑类型、完整Electron或模型套件；不把此前套件结果归到本轮。改动文件检查未发现凭据或忽略目录误提交，startup未修改。
