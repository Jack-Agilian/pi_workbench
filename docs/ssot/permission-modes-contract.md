# 权限模式与宿主审批

2026-10-04更新。接续[UI契约](ui-experience-contract.md)，不替代 Pi Session、工具或现有[进程边界](b-worker-contract.md)。人工/自动阶段见[原验证报告](../validation/permission-modes-2026-10-03.md)，完全访问见[产品接入证据](../validation/full-access-product-2026-10-04.md)。

## 当前行为

| 模式 | 决策 | 文件/网络范围 | 状态 |
|---|---|---|---|
| 人工审批 | 既有逐操作允许/拒绝 | 既有批准 workspace、工具及宿主网络代理 | 已实现，旧库/新会话默认 |
| 自动审批 | 宿主 `workspace-tools-v1` 规则自动允许已准入的 read/write/edit/Bash；未知工具仍等待人工 | 与人工相同；文件工具仍限定 Markdown，Bash仍受既有目录和网络限制 | 已实现，用户在会话中显式选择 |
| 完全访问 | 宿主 `full-tools-v1` 自动允许已准入文件/Bash操作 | 原生文件工具可读写目录外有界UTF-8文本；Bash可访问目录外文件与IP网络；应用私有目录禁止、运行代码只读 | 已限定接通macOS arm64，用户显式选择 |

自动审批是确定的允许规则，不是风险分类器，也不检查 Bash 是否“安全命令”。它可能允许工作目录内修改/删除文件，界面在选择时说明。没有新增费用、请求或工具次数门槛；单LLM总时间/网络空闲仍属API检测。模型端点、数据范围、启用工具、资源与凭据由原宿主配置控制，选择自动不增加任何一个。

## 所有权、持久化和执行

原SQL v10增加 threads/runs 的 `permission_mode`、`permission_revision` 以及 approvals 的 `source`。旧行迁移为 manual/0/manual，原请求、审批、事件、用量、原生Session引用和文件不重写。SQL v11在同一事务中扩展上述CHECK枚举并保留原行、修订和批准来源；v10真实窄CHECK迁移及重复打开已测试。旧构建不能打开新版本，不以降级代码作恢复方式。

产品命令 `threads.permissions` 仅接受threadId、manual/auto/full、expectedRevision与requestId。宿主比较版本，原子保存下一修订并记录事件；同requestId重复请求返回原确认，不能重复修订。它不接收目录、执行器、网络、凭据或批准来源参数。

`runs.start`携带界面读到的permissionRevision；不一致返回明确`permission_changed`且不新增Run。任务接收时把mode/revision固定到Run，包括已排队任务。修改会话设置不会批准旧任务的pending操作，也不会撤销或改写旧Run策略；停止仍使用原取消入口。旧CLI/测试调用者省略revision时明确使用manual/0，不能隐式继承更宽松的桌面选项。

宿主在 `requestOperation` 原事务内创建操作与审批记录，再按Run模式决定pending或approved，自动来源分别为 `workspace-tools-v1` / `full-tools-v1`，事件为 `approval.automatic`。这只是审批决定：Supervisor仍校验资源内容、读取版本、期限和绑定，随后调用同一 `claimOperation`；Worker不得自称已获批准。领取、真实Pi工具、成果核实、进程收据和最终结算全部沿用既有链路。取消撤销未执行批准，重复领取/过期/旧绑定仍失败。观察、快照、重连均不执行工具。

模式是产品协议，不是Pi官方API。Run与Thread展示字段及Operation批准来源是必需投影；合成测试显式构造这些字段，不为方便fixture放宽生产类型。

## 桌面交互

入口的值标签、提示、选择面板、状态位置及键盘规则统一由[PERMISSION](ui/shell/workspace/conversation/composer/permissions.md)持有，审批空间由[TOOLS](ui/shell/workspace/conversation/tools.md)持有。本节只维护产品行为：设置保存不占用停止/审批按钮的命令锁；未知确认保持原请求并提供显式重试，期间不发送新任务；切换会话/宿主身份隔离旧回调；设置不是前端乐观授权。

发送遇到明确版本冲突时丢弃该未接收请求身份、保留草稿并提示重新核对；确认丢失则仍保留同一Run意图，不生成新Run。自动操作记录显示“自动批准”，运行信息显示该Run实际模式；重开读真实持久状态。

2026-10-03后续收口：审批已按Operation身份放入会话操作记录，独立活动快照保证历史失败时仍可审批；成果详情默认关闭且不再承载审批。活动任务显示其固定模式，避免把输入区的新选择误认为当前任务权限。Pi资源加载器中的系统提示改为“每个操作由宿主按人工/自动规则授权”，不再错误宣称全部人工；拒绝/取消/未确认不得重试等约束保留，提示不是授权凭证，也未新增Worker权限字段。[本批证据](../validation/inline-approval-2026-10-03.md)。

## 模块与参考

| 本项目模块 | 参考/API | 采用范围 | 保留边界 |
|---|---|---|---|
| permission-picker / composer | pi-gui固定会话/输入布局，见[指定参考](reference-implementations.md)；[React状态与身份](https://react.dev/learn/preserving-and-resetting-state)、Context7核对的[控件状态](https://react.dev/reference/react-dom/components/select) | 输入附近的紧凑入口、组件身份失效；本项目使用原生details/buttons | 不复制社区SessionDriver，不引入新组件依赖 |
| ProductCore / 产品命令 | [OpenCode allow/ask/deny](https://opencode.ai/docs/permissions/)、[Codex审批与访问范围](https://learn.chatgpt.com/docs/sandboxing)、[Claude模式差异](https://code.claude.com/docs/en/permission-modes)；本仓库requestOperation/claimOperation | 固定宿主规则、会话设置与Run快照、批准来源 | 不声称复刻分类器、第三方API或全部模式；不靠前端隐藏确认放行 |
| Supervisor / Pi适配 | 已安装Pi0.87.1公开工具工厂与Operations、原delivery/claim/recovery | 原链路直接复用，新增批准状态不绕过执行前校验 | 发行包docs/extensions.md明确扩展与Pi同OS权限；不可搬进扩展充当宿主隔离 |

## 完全访问的宿主范围与恢复

平台前置见[原报告](../validation/full-access-platform-2026-10-04.md)，产品接入见[本批报告](../validation/full-access-product-2026-10-04.md)。该产品接入批次SQL/IPC均为v11；SQL v12另增[名称修订](thread-naming-contract.md)，当前SQL v13/Worker IPC v12另增[只读正文范围](safe-reading-contract.md)，权限语义不变。`DesktopHost`只从宿主配置提供profile、受保护目录、已登记凭据目录；Renderer只能选择模式，不传目录例外、可执行文件、环境、网络策略或数据库路径。不支持的平台、缺失/别名保护根、保护范围冲突直接拒绝，不静默放宽。

Worker启动策略、Pi Operations与宿主核验共享同一Run绑定的文件范围。目录内保持相对路径，目录外用规范绝对路径；批准摘要包含范围、参数、版本、资源、绑定与期限。宿主独立复核，Worker直接伪造合法通道请求也不能绕过私有目标拒绝。重开对账合并原Run保护集与当前宿主保护集，不因配置变化丢失原拒绝。

完全访问仍不开放自动扩展发现、用户环境继承或Pi直连网络。Worker只读批准资源，可写自身Session/agent目录；其Node FS权限放宽后的私有SQLite拒绝由实际Mac OS策略验证。Bash通过原guardian执行，具备IP访问而非Unix/Mach服务访问；自身临时home例外由宿主生成，不能读取其他任务或产品数据库。原清理收据、后代管理和同一个取消完成Promise继续复用。

Pi公开read/write/edit工厂与Operations不重写；本批原生文件接入仍是UTF-8文本、单文件16000字节、路径1024字符及原有有界IPC，非图片/任意大文件支持。不支持`~`/`@`别名，不宣传路径预检为原子CAS。Bash不受Markdown扩展名约束。文件工具写入的workspace Markdown可登记原成果；目录外及非Markdown只记Operation目标、版本与摘要，不放入workspace成果预览。

自动批准不跳过资源、版本、有效期或取消检查。真实Worker/宿主被终止后保留unknown，只有宿主清理及真实文件/数据库核验后才释放名额；已写但结果丢失只核验，不自动重写。Pi结束、工具副作用及进程清理仍为不同事实。

## 完全访问验收范围

- 已测实际Pi Worker目录外read/write/edit、真实Bash、Run固定模式及重复启动一次执行；私有目标和运行代码拒绝。
- 已测实际Worker及Bash不能打开/创建合成宿主SQLite；Bash固定loopback HTTP成功。其他外网/DNS/TLS/IPv6/UDP未验，不访问真实凭据或模型。
- 已测自动批准后版本/取消/资源变化阻止执行；活跃Bash取消；文件落盘后Worker与独立App Server被SIGKILL，真实清理后重开产品库不重发副作用。
- 已测旧SQL v10权限/审批/请求迁移、真实Electron第三档选择及重连、1320/820宽度可达；原人工/自动流程回归。不是完整人工或无障碍验收。
- 不宣称任意恶意进程、预存外部硬链接、TOCTOU或系统级通用沙箱；固定后代/端口/心跳证明沿用并重跑平台矩阵。其他平台未支持。

UI-01/02与SEC-02保持in_progress，整个工作台目标和完整人工体验继续保留；会话命名及Markdown/限定正文补读已由后续契约实施，不能据此关闭全部体验事项。唯一当前事项以NEXT_STEPS顶部为准。
