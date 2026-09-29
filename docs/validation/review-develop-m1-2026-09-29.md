# develop 35384b0 复审、策略修订与 M1-B 续验

基线 `35384b06a9cac085bd3a80ba6d6d43683d56f147`；分支 `codex/m1-resume-policy`。实现/集中回归 SHA `a6cb0f3`（完整值见[输入摘要](m1-resume-inputs.json)）；测试夹具修正及真实续验 SHA `31c15593a8773860dcebaad5217adf05a4dd5e05`。后者只比实现提交多两个测试夹具修正，运行代码相同。平台为 macOS 27.0 / arm64，Node 24.21.0、Pi 0.87.1，依赖与锁不变。历史失败见[首次真实报告](pi-0871-m1-live-2026-09-29.md)。

## 审核裁决和修正

核对原审核包 MANIFEST 22 个条目、8 份完整源码与 Git 对象、预算方法摘录；在项目 Node/macOS 上复制重跑 21 项局部断言，包含 R01 错误拒绝复现，并非修复证明。原审核包未改写，原始输出位于 `.artifacts/review-develop-35384b0/`。未独立查询 GitHub Actions，不能引用审核包的 0 项查询作为本次 CI 成绩。

- R01 成立：旧 JSON.stringify 摘要受顶层/嵌套字段顺序影响。新增宿主专用 model-policy-v1 固定字段摘要，不改工具参数摘要。v7 追加修订表，历史请求行不重写；原顺序配置能证明旧摘要才接受兼容映射，不能证明则拒绝。移除旧运行时预算入口，模型只走配置感知的原子预留。
- R02 已有保护与续验缺口成立：显式本地 timeout-only 修订，原授权及所有其他字段不变、追加可核验旧/新摘要/配置/时间。活动/排队/unknown Run 阻断修订；revisionId 幂等且拒绝内容冲突。旧次数及保守预留按 authorizationId 累积。home 与新 Run 接收前显示策略/预算阻断，发送前仍原子复核；旧 requestId 的确认重试继续原幂等契约。
- R03 成立：新增 prepare/execute-approved 两步追加续验。只读原报告、原 requests 绑定、成功 Run、原 Thread/nativeSessionRef 和实际账本；不选最新文件、不重建 JSONL、不重发 first。计划和结果采用独占创建，已执行/中断 attempt 不自动重发；恢复失败停止；未观察流不声称活跃取消。
- N01 现状文档已更正；未扩大平台或安全声明。

## 默认等待与授权

用户要求参考 pi-coding-agent 默认配置。Context7 的 v0.87.1 文档、已安装官方 settings.md 及公开 `SettingsManager.inMemory().getHttpIdleTimeoutMs()` 一致返回 300000ms。[官方固定版本配置](https://github.com/earendil-works/pi/blob/v0.87.1/packages/coding-agent/docs/settings.md) 指出 HTTP 空闲超时为 5 分钟，Provider timeout 默认沿用。它不是整个 Run 的硬截止，也不是零重试默认的完整复制。

本轮将应用 timeoutMs 从 30000 修订为 300000；保留同授权 4 次、输出 512 token、估算上限 1 美元、原模型/endpoint/合成数据范围不变。启动 ready 上限仍 5 秒，宿主总截止为请求期限加 5 秒；取消 400ms 后可进入停止，guardian 保留截止后 3 秒兜底。重试/压缩/预热仍关闭。不研究用户 URL 后端。

`model:policy check` → `apply-approved` 保存修订记录；原/候选配置在应用私有目录保留，原配置验证一致后替换 model.json。准备时只读真实账本：已用 2/4、预留 0.068512 美元、无活动 Run。修订没有退款或重置。

## 离线验证

集中执行 30 条命令：环境、typecheck、声明补丁、A1–A4、ProductCore/SDK/Worker/Shell、桌面、模型协议/配置/网络/续验、真实 Electron 模型/界面/Shell/退出、四种 Shell 驱动以及 Python SSOT/脚本/文档结构/完整示例检查。命令、SHA、时刻及输出摘要逐条见输入 JSON。

首次 28 条通过，Worker 和桌面套件各有一个旧迁移夹具失败：构造 v1/v3 时没有删除新 v7 表，重新迁移报表已存在。仅修正这两个夹具并提交 `31c1559`，补跑 Worker 51 项及桌面 19 项全部通过；不把首次失败改写成通过，不宣称重跑了整套 30 条。此前实施期 typecheck 也捕获测试调用错误的 ProductCore 方法名，已在实现提交前更正。新增续验套件 9 项通过，使用临时 SQLite、合成绑定/客户端、隔离 HOME 和禁网入口；合成 hostClean 不冒充进程级证明。真实进程证明来自既有 Worker/桌面回归及下方真实收据。

## 真实续验

`npm run validate:model-resume -- prepare m1-pi-default-20260929` 后执行对应 `execute-approved`。实际时段 2026-09-29T03:37:56.926Z 至 03:38:06.101Z，代码 SHA `31c1559`。原报告保留，新增结果记录在原 model-profile；跨克隆可定位的脱敏摘要在本报告与输入 JSON。

| 阶段 | 真实结果 | 宿主/原生核验 |
|---|---|---|
| 恢复 | 5.129 秒，completed；观察到流，返回先前 token；SDK input 4520/output 20，估算 $0.0001164 | 原 Thread/原生 Session 引用未变，零 Operation；退出及 groupGone 收据通过 |
| 活跃取消 | 3.621 秒，观察流后发送取消，最终 cancelled | 产品重读仍 cancelled；Pi 原生末尾 stopReason=aborted；零 Operation；退出及 groupGone 收据通过 |

原生 Session 通过公开 SessionManager 读取，角色序列保留首次成功、历史 error、此次恢复 stop、此次取消 aborted。没有手写/替换原生消息树。宿主已关闭、活动 Run 为 0；累计 4/4、保守预留 0.137024 美元，status=budget_exhausted。未额外尝试、未重发 first。

取消时 SDK 报 input/output/cost 为 0，**这不证明零计费**：取消请求的实际服务用量/账单未知，历史超时请求也未知，所有预留保留不退。恢复金额同样只是 SDK 估算，不能代替服务商账单。对实际 key 字节扫描产品 profile 与本轮改动共 37 个文件，0 匹配；未输出 key。

## 状态和停止点

R01/R02/R03/N01 在上述限定范围修正。MODEL-02 的无工具 Mac 文本/原会话恢复/活跃取消与用量观测完成，等待本轮审核后再决定 M2；当前授权已耗尽，不再自动请求。M0-UI/M0-SDK 原登记状态不变，M0-Pi 仍 blocked（尚无真实工具审批任务闭环）。Windows、Keychain、其他 Provider、任意后代、生产发行和服务商实际计费未验证。未合并 develop，不启动 M2。
