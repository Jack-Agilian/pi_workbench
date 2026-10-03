# 完全访问：产品权限、Pi工具与持久恢复

2026-10-04（Asia/Taipei）。基线 `e2c4105c72369964db39af421419635c7556c0f4`，分支 `codex/ui-correctness`。产品接入被测代码 `bded873e924e0ef975287456268a30264f848cfe`；后续桌面修订被测代码 `75aed173cfb2dd399455d1b8560963e65bbac574`（仅4个桌面源文件变化），证据在下方分列。未合入develop，不将文档提交冒充被测代码。

## 新功能与复用范围

桌面可显式选择人工审批、自动审批、完全访问。完全访问由宿主扩大原Pi工具的实际范围：read/write/edit可操作目录外有界UTF-8文本，Bash可操作外部文件及IP网络；不是仅隐藏确认按钮。应用私有数据/凭据目录和运行时代码仍受保护。当前任务保留接收时的模式，输入区新选择只作用于之后接收的任务。

| 本项目模块 | 实施前参考/API | 借鉴或替换范围 | 保留边界 |
|---|---|---|---|
| ProductCore / app-contracts | 现有v10权限、requestOperation/claimOperation；[SQLite ALTER TABLE](https://www.sqlite.org/lang_altertable.html) | v11在事务中扩展CHECK，保留旧权限、请求及批准来源；增加full-tools-v1 | SQLite仅宿主写入；模式名是项目协议，不冒充Pi API |
| controlled-tools / file-target / file-planning | 已安装Pi0.87.1根导出的createReadToolDefinition/createWriteToolDefinition/createEditToolDefinition/createEditTool及公开Operations | 继续由Pi执行读写/编辑和计算编辑结果；共享最小目标准入与原版本摘要核验 | 不重写工具算法、Pi别名解析或历史；预检不是原子CAS |
| DesktopHost / Supervisor / launcher / guardian | 原B-IPC/D2-S监督、清理收据及[平台前置](full-access-platform-2026-10-04.md) | 宿主保护集绑定到Run；选择原平台策略；结果丢失只核验外部文件 | Worker不持产品库访问能力，Renderer不传执行器/环境/目录例外 |
| macos-access | sandbox-runtime固定提交`9e93406ab2e0b6e9794624896f729560dc9445db`的macos-sandbox-utils.ts，Apache-2.0，来源身份见平台报告 | 沿用已核验拒绝优先、祖先固定与目录例外；补只读批准资源例外 | 不安装/移植通用sandbox runtime；只证明所测固定进程和目录边界 |
| permission-picker / RunHistory | 原权限入口与已固定pi-gui会话/输入布局 | 同一入口增加第三档说明，历史显示真实Run模式与批准来源 | 不复制社区SessionDriver；三栏、审批就近与停止仍沿原结构 |

本次复核当前发行包公开工具类型声明与既有适配，不升级Pi或声明补丁。Context7先定位`/websites/sqlite_docs`，ALTER/CHECK查询无匹配结果，改查上述SQLite官方说明；不能把空查询说成API已验证。迁移行为以真实SQLite测试为依据。没有新增依赖、包管理器、锁文件或第二套Session/执行系统。

## 宿主边界

- SQL v11保留旧数据并扩展manual/auto/full和批准来源；IPC v11只增加宿主生成的文件范围。宿主基于持久Run模式选策略，并把范围纳入批准摘要。
- 私有集合包含应用profile、宿主保护目录和已登记凭据目录。Worker可用自己的agent/Session目录、只读批准资源；Bash只获得自己的临时home例外。保护根必须存在、规范且不冲突，不支持的平台或缺保护即失败。
- 目录外文件使用规范绝对路径；宿主独立复核范围、版本、资源和期限。重开恢复同时保留原保护集和当前保护集；外部结果只记Operation，workspace Markdown仍走原成果核验。
- 自动批准仍需一次领取，取消/资源变化/文件版本变化可阻止执行。Pi结束不等于进程清理；终止后先unknown，真实清理和副作用核验后才结算。不重发未确认副作用。
- 产品不增加次数/费用/输出或固定Bash时长预算；30分钟单LLM总超时与5分钟网络空闲检测保持。测试的合成任务数、期限和故障开关不暴露为产品权限。

## 实际平台与验证

macOS27.0.1（26A434）arm64，项目Node24.21.0/npm11.19.0、Pi0.87.1、Electron44.4.5。所有文件/库/凭据为受管理临时合成资料；Provider响应为明确SYNTHETIC。真实模型调用0。只有固定本机loopback网络测试；不读取真实用户auth.json或系统密钥库。

`npm run test:product-full-access` 的11项在上述代码SHA通过：

1. 实际Pi Worker在外部txt文件write/read/edit，Bash外部计数仅一次；workspace Markdown正常登记成果。重复启动同Run同Promise，切换会话模式不改旧Run；原生Session重开并继续原上下文，不重写文件。
2. 原生工具拒绝私有canary和运行代码写入，宿主无已批准操作，原内容不变。
3. 文件落盘、完成消息前SIGKILL真实Worker；重开产品库只核验原摘要/mtime，原Operation成功、Run失败，不登记外部成果、不重发。
4. 实际Pi Worker在宽Node FS许可下仍无法读取/创建私有SQLite，环境无Provider key/NODE_OPTIONS；原guardian下Bash同样拒绝测试库，固定loopback HTTP成功。
5. 活跃外部Bash写心跳期间取消；原进程清理后重开读cancelled，保留sideEffects=possible，文件mtime停止变化。
6–8. 自动批准产生后分别改变文件版本、取消、修改批准资源；执行前拒绝，目标无工具新写入。
9. 当前实例/绑定/通道及资源身份都合法的伪造file-operation绕过包装发送，宿主仍拒绝私有目标；无Operation、原文件不变，先unknown，重开对账后failed。
10. 真实v10窄CHECK重建迁移，manual/auto修订、请求身份和既有workspace-tools-v1审批原样保留，外键完整、非法模式拒绝。此项为模块迁移合成状态，不用作进程清理证据。
11. 独立App Server在外部文件落盘后SIGKILL；原guardian产生真实清理收据，新ProductCore/Supervisor重开两次核验不重放，mtime与启动数不变。

该SHA的集中回归：

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | 严格类型与既有声明补丁检查通过 |
| `npm run test:pi-probe` / `test:pi-tools` / `test:pi-shell` / `test:pi-resources` / `test:pi-auth` | 分别15 / 19 / 4 / 12 / 18通过 |
| `npm run test:product-core` / `test:product-sdk` / `test:product-worker` | 25 / 5 / 51通过 |
| `npm run test:product-shell` / `test:product-file-agent` / `test:product-model-shell` | 28 / 34 / 39通过；含无缺省验证额度与实际31秒Bash |
| `npm run test:backend-history` | 15通过 |
| `npm run test:product-full-access` / `test:execution-access` | 11 / 7通过 |
| `npm run test:desktop` | 41通过，新增full真实Worker写一次/重开/切回人工拒绝 |
| `npm run test:model-network` | 固定loopback transport、redirect拒绝与实际Worker SQLite/网络边界通过 |

后端集中回归结束后，发现完整UI测试的滚动基线失败，另以桌面修订SHA验证下列命令；后端代码未改变，不把前一SHA的结果伪记到后者。

| 命令 | 桌面修订SHA结果 |
|---|---|
| `npm run typecheck` / `test:desktop` | `75aed173cfb2dd399455d1b8560963e65bbac574`：严格类型、41项通过 |
| `npm run test:desktop-ui` | `75aed173cfb2dd399455d1b8560963e65bbac574`：真实Electron人工允许/拒绝/取消/崩溃、长历史及三栏/成果流程通过；已包含右栏布局后跟随最新与真实键盘阅读锚点 |
| `npm run typecheck` / `test:desktop-file-agent` / `test:desktop-shell` | `c123cc6ccaf24a00a8de815273c8a0c2c2c4ea7d`：通过；相对75aed17仅文件工具测试文案断言更新 |
| `npm run typecheck` / `test:desktop-agent-shell` | `5eb203a09f7294cad9e7015d3d5294540c6f04de`：严格类型及实际Electron流程通过；三档选择、当前任务模式、确认丢失/版本冲突、真实Bash与重连无重放；1320/820全访问按钮可达 |

开发前检查通过；以上代码加本次文档差异的最终检查使用仓库`.venv/bin/python`：`scripts/check-ssot.py` 60通过，`scripts/test-tools.py` 15通过，`scripts/check-docs.py --structural-only` 5通过/2跳过。未运行完整文档示例typecheck。

## 开发失败与验证限定

基线上的未提交开发阶段先遇到两处旧函数名未替换、可变plan导致类型缩窄失效、订阅清理误当函数调用；类型检查均已发现并修正。新增伪造请求测试第一次错误预期立即failed，实际为unknown；按照现有清理语义增加真实重开对账并精确断言unknown→failed，没有更改结算逻辑或放松断言。

`bded873`首次完整`test:desktop-ui`在相邻成果预览断言失败（timeline scrollTop 11460.5→12367.5）；后续两次加入几何诊断的执行通过，但观测到following标志仍为true且scrollTop距真实底部907px，不能据重跑通过关闭问题。增加“右栏布局后仍在最新”检查后超时，证明不是仅预览基线等待不足。

复读[pi-gui固定viewport实现](https://github.com/minghinmatthewlam/pi-gui/blob/163054227d370a49d09099c61eb65798481294ac/apps/desktop/src/features/conversation/hooks/use-timeline-viewport.ts)的几何变化/阅读意图区分。新增上一轮已提交尺寸与输入意图检查，浏览器布局导致的滚动不改变用户跟随状态；保留单一滚动所有者与既有Run锚点，不搬入社区虚拟化/行估高系统。扩大范围的权限说明也同步修正，避免全部Bash仍被描述为禁网。

第一轮几何保护测试暴露测试驱动直接设置scrollTop并非真实阅读输入；改用实际Home/PageDown键后又发现键盘动画尚未停止便取锚点。最终等待真实滚动连续稳定帧，再触发旧内容增长；保留原小于3px的锚点和预览断言，另外要求右栏布局后确实在底部。开发修订全部通过后提交`75aed17`并做最终集中回归，不用两次诊断阶段的偶然通过代替最终证据。

`75aed17`的`test:desktop-file-agent`先因旧“逐项批准”文案断言失败；`c123cc6`改为同时核验受限/完全访问的真实范围，保留文件/审批/成果和重连断言后通过。同一批`test:desktop-agent-shell`又发现新说明遗漏“宿主授权”文字，补回该权限所有权说明；其余执行逻辑未改变，最终复跑结果见上表。

原始输出保存在忽略的`.artifacts/full-product-20261004/`，本报告为跨克隆可定位的脱敏摘要。未提交运行库、密钥、个人配置、第三方源码或原始截图。

范围仍限有界UTF-8文本（16000字节）、原生文件路径1024字符及既有IPC界限，不含图片、大文件或`~`/`@`别名。目录外与非Markdown不自动成为workspace成果。网络只实测本机TCP/HTTP，不声称公网DNS/TLS、IPv6/UDP；系统策略不保证任意恶意进程、预存外部硬链接或TOCTOU隔离。Windows/Linux未支持；没有完整人工/无障碍/真实模型三档体验验收，也未重跑npm/Git包安装探针或全部Electron退出矩阵。

UI-01/02、SEC-02、CORE-04及ART-01仍in_progress，M0 Gate不扩大。下一事项是会话持久命名/重命名，其后安全Markdown与按需全文。Skill评估：完全访问配置与准入仍在演进，尚不适合固化为独立Skill；已有单一npm入口提供明确输入、输出和验证，不新增宽泛维护Skill。
