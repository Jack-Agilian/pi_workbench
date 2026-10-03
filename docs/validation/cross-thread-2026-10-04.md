# 跨会话执行入口与连续使用复审

2026-10-04（Asia/Taipei）。基线 `fd5857f6d98ec93e46b977e95eaa584c80af926b`；功能分支 `codex/ui-correctness`，未合入develop。实际被测代码 **`24e59d86813adc2334319ef8dbe68d6e50c08904`**；代码提交后才运行最终回归。

## 发现与本批行为

前批解决了当前会话内的布局和停止可达，但选择其他会话后，原任务的审批/停止入口随当前视图消失；原会话若被搜索过滤或不在目录首屏，就难以返回。这是U04/U09的跨会话缺口，不能仅靠当前会话的缩放检查关闭。

本批在主区增加一条紧凑的其他会话执行提示。宿主仍在执行的任务不受会话列表过滤/分页影响，可以“查看任务”返回原会话再处理审批，或直接停止该确定Run。返回保留两边草稿，并关闭目标会话的成果覆盖层以便操作；不发送执行/审批命令。等待清理或结果待核实时不会显示可再次停止的按钮，也不宣称任务已完成。

M0仍是全局单执行。`DesktopHome.activeRuns`由宿主提供，实际不包含queued；新入口不是全局队列管理器。排队取消继续走各自会话的既有按钮。若原会话不在home首32条中，显示会话短身份，不捏造名称；实际导航和取消仍绑定完整宿主Thread/Run ID。

## 采用与边界

| 本项目模块 | 参考文件/API | 借鉴/新增范围 | 保留边界 |
|---|---|---|---|
| renderer / other-runs | pi-gui固定MIT提交 `163054227d370a49d09099c61eb65798481294ac` 的 [sidebar.tsx](https://github.com/minghinmatthewlam/pi-gui/blob/163054227d370a49d09099c61eb65798481294ac/apps/desktop/src/features/threads/sidebar.tsx) | 核对selectedSession与列表独立、显式onSelectSession；本项目用既有选择/草稿/读取入口返回执行会话 | 没有复制社区driver、DnD或调度；不使用社区直接SDK abort代替宿主取消 |
| other-runs | 既有DesktopHome.activeRuns、产品runs.cancel | 小型展示适配，使用真实宿主身份，按钮禁用沿用连接/命令状态 | 不改core.activeRuns含义，不从Worker声明权威；无新IPC/SQLite/SDK入口 |
| other-runs-smoke | 既有真实Electron/HostClient/Worker测试链路 | 显式合成目录、真实排队/取消/文件核验、两边草稿及三组尺寸 | 测试代码不进Renderer，不产生真实模型请求 |

无新增依赖、安装或锁文件改动，SQL v13和Worker IPC v12不变，Pi原生Session/工具及宿主审批/进程/文件权限边界保留。既有React公开状态/DOM使用方式沿用当前仓库已验证采用，没有引入新的库API。

## 实际环境和未完成的桌面操作

macOS27.0.1（26A434）arm64，项目Node24.21.0/npm11.19.0、Electron44.4.5、React19.3.0、Pi0.87.1。尝试运行隔离 `node scripts/launch-desktop.mjs --model-shell-offline --dev-profile=daily-review-20261004`，应用构建并启动，但桌面操作工具 `getApp("Electron")` 返回Mac已锁定且不能自动解锁。未更改系统权限或锁屏设置，随后只对本次启动器发送SIGTERM，退出0。

因此本批没有把该尝试称为交互体验通过，也没有执行VoiceOver。后续证据来自真实Electron的程序化操作/截图、真实库和子进程，Provider/记录明确SYNTHETIC；**真实模型调用0**。不读取真实用户数据库或配置。

## 开发失败与修正

- 新测试最初期待home.activeRuns同时包含执行和排队两项，连续两轮超时；诊断显示宿主只返回一项实际运行。核对ProductCore后确认这是既有契约，不是丢任务。删除不适用的多任务选择器，排队取消改用排队Run所在会话的原按钮，仍验证零操作且不取消另一个运行任务。没有改宽宿主快照或降低取消结果断言。
- 跨会话场景随后通过，但插入到原四场景之前的35个目录条目令原固定5条home断言失败（实际32）。将新增场景移到既有目录/重连回归之后、原最终关闭场景之前。原5条、幂等计数及75条目录断言全部保留，不将32当作预期来掩盖测试污染。
- 检查截图发现仅等两个动画帧可能赶在缩放的布局状态更新前。最终测试明确等待实际CSS视口宽度、窄窗状态和导航隐藏一致，再检查和截图；旧开发截图不作为最终缩放证据。

开发第四轮完整UI退出0；最终代码提交后按下表重新集中验证。原始失败/日志在 `.artifacts/cross-thread-20261004/`，跨克隆引用本文脱敏摘要。

## 最终验证

以下均在上述提交上实际运行，退出0：

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | 严格类型与原声明补丁检查通过 |
| `npm run test:desktop` | 44项通过 |
| `npm run test:desktop-ui` | 原完整场景和新增跨会话返回/取消/草稿/尺寸检查通过 |
| `npm run test:desktop-file-agent` | 真实Pi write/read/edit、审批、成果与重连通过，Provider合成 |
| `npm run test:desktop-agent-shell` | 真实Bash、目录、独立审批/非零结果、三尺寸及重连通过，Provider合成 |

最终实际查看200%截图，导航已收起，其他任务入口与发送区可见。原始results.json按命令记录完整SHA；未重跑全套A1–A4、完整24场景退出套件、发行包或初始化，不沿用旧日志冒充本轮。

新增测试通过真实产品命令创建执行会话、排队会话与阅读会话：先取消队列且确认零操作，运行任务保持running；创建35条合成目录使原执行会话离开home首屏，并设无匹配搜索。点击其他任务入口没有发送任何产品command，原审批仍可用且原草稿恢复；回到阅读会话后以原Run身份停止，恰一条取消命令，宿主最终cancelled，目标文件不存在，原Run/Operation各一条、成果零条。阅读草稿不变，当前空会话不出现另一个任务的完成通知。

尺寸覆盖1320×900与820×640的100%，以及820×640的200%；最终显式等待布局稳定，查看/停止入口和输入区均需在视口内，另保留至少40 CSS px阅读区域。这个阈值仅用于最小缩放窗口新增提示的可用性检查，不替换前批当前会话四组布局的80px断言。

该场景验证等待审批Worker的跨会话取消；真实执行中取消、允许/拒绝、故障恢复与同requestId回归由完整原UI场景保留，不混称为新场景实际执行工具后取消。尚未验证锁屏解除后的连续代理桌面操作、用户人工验收、VoiceOver或其他平台。UI-01/UI-02/ART-01和既有M0 Gate不晋级。

Skill评估：本批仍依赖产品交互设计及变化中的测试组合，不是稳定独立的重复运维流程；不创建Skill。锁屏诊断是一次环境限制，也不单独固化Skill。

## 文档与提交检查

代码不变、报告/SSOT/计划更新后，实际执行 `.venv/bin/python scripts/check-ssot.py`（60项通过）、`.venv/bin/python scripts/test-tools.py`（15项通过）、`.venv/bin/python scripts/check-docs.py --structural-only`（5通过/0失败/2按模式跳过）；27个startup快照保持一致。`git diff --check`通过，本轮14个变更文件未包含startup/忽略产物，新增行常见凭据标记0；这不是完整语义秘密检测。维护检查不作为额外SDK/平台证据。
