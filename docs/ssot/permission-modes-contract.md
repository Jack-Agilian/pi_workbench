# 权限模式与宿主审批

2026-10-03。接续[UI契约](ui-experience-contract.md)，不替代 Pi Session、工具或现有[进程边界](b-worker-contract.md)。代码和实际范围见[验证报告](../validation/permission-modes-2026-10-03.md)。

## 当前行为

| 模式 | 决策 | 文件/网络范围 | 状态 |
|---|---|---|---|
| 人工审批 | 既有逐操作允许/拒绝 | 既有批准 workspace、工具及宿主网络代理 | 已实现，旧库/新会话默认 |
| 自动审批 | 宿主 `workspace-tools-v1` 规则自动允许已准入的 read/write/edit/Bash；未知工具仍等待人工 | 与人工相同；文件工具仍限定 Markdown，Bash仍受既有目录和网络限制 | 已实现，用户在会话中显式选择 |
| 完全访问 | 拟取消普通工具逐项询问并真实扩大访问范围 | 工作目录外文件/网络与必须保留的产品私有目录边界尚未接通 | 未实现，不提供可选按钮，协议拒绝 `full` |

自动审批是确定的允许规则，不是风险分类器，也不检查 Bash 是否“安全命令”。它可能允许工作目录内修改/删除文件，界面在选择时说明。没有新增费用、请求或工具次数门槛；单LLM总时间/网络空闲仍属API检测。模型端点、数据范围、启用工具、资源与凭据由原宿主配置控制，选择自动不增加任何一个。

## 所有权、持久化和执行

SQL v10仅增加 threads/runs 的 `permission_mode`、`permission_revision` 以及 approvals 的 `source`。旧行迁移为 manual/0/manual，原请求、审批、事件、用量、原生Session引用和文件不重写。当前构建可重复打开v10；旧构建不能打开该新版本，不以降级代码作恢复方式。

产品命令 `threads.permissions` 仅接受threadId、manual/auto、expectedRevision与requestId。宿主比较版本，原子保存下一修订并记录事件；同requestId重复请求返回原确认，不能重复修订。它不接收目录、执行器、网络、凭据或批准来源参数。

`runs.start`携带界面读到的permissionRevision；不一致返回明确`permission_changed`且不新增Run。任务接收时把mode/revision固定到Run，包括已排队任务。修改会话设置不会批准旧任务的pending操作，也不会撤销或改写旧Run策略；停止仍使用原取消入口。旧CLI/测试调用者省略revision时明确使用manual/0，不能隐式继承更宽松的桌面选项。

宿主在 `requestOperation` 原事务内创建操作与审批记录，再按Run模式决定pending或approved，自动来源为 `workspace-tools-v1`，事件为 `approval.automatic`。这只是审批决定：Supervisor仍校验资源内容、读取版本、期限和绑定，随后调用同一 `claimOperation`；Worker不得自称已获批准。领取、真实Pi工具、成果核实、进程收据和最终结算全部沿用既有链路。取消撤销未执行批准，重复领取/过期/旧绑定仍失败。观察、快照、重连均不执行工具。

模式是产品协议，不是Pi官方API。Run与Thread展示字段及Operation批准来源是必需投影；合成测试显式构造这些字段，不为方便fixture放宽生产类型。

## 桌面交互

输入区用单一“权限”展开入口显示宿主当前模式；选择说明只在展开时出现，常规会话不增加大面板。设置保存不占用停止/审批按钮的命令锁。未知确认保持原设置请求并提供显式重试，期间不发送新任务；切换会话/宿主身份隔离旧回调。设置不是前端乐观授权。

发送遇到明确版本冲突时丢弃该未接收请求身份、保留草稿并提示重新核对；确认丢失则仍保留同一Run意图，不生成新Run。自动操作记录显示“自动批准”，运行信息显示该Run实际模式；重开读真实持久状态。

2026-10-03后续收口：审批已按Operation身份放入会话操作记录，独立活动快照保证历史失败时仍可审批；成果详情默认关闭且不再承载审批。活动任务显示其固定模式，避免把输入区的新选择误认为当前任务权限。Pi资源加载器中的系统提示改为“每个操作由宿主按人工/自动规则授权”，不再错误宣称全部人工；拒绝/取消/未确认不得重试等约束保留，提示不是授权凭证，也未新增Worker权限字段。[本批证据](../validation/inline-approval-2026-10-03.md)。

## 模块与参考

| 本项目模块 | 参考/API | 采用范围 | 保留边界 |
|---|---|---|---|
| permission-picker / composer | pi-gui固定会话/输入布局，见[指定参考](reference-implementations.md)；[React状态与身份](https://react.dev/learn/preserving-and-resetting-state)、Context7核对的[控件状态](https://react.dev/reference/react-dom/components/select) | 输入附近的紧凑入口、组件身份失效；本项目使用原生details/buttons | 不复制社区SessionDriver，不引入新组件依赖 |
| ProductCore / 产品命令 | [OpenCode allow/ask/deny](https://opencode.ai/docs/permissions/)、[Codex审批与访问范围](https://learn.chatgpt.com/docs/sandboxing)、[Claude模式差异](https://code.claude.com/docs/en/permission-modes)；本仓库requestOperation/claimOperation | 固定宿主规则、会话设置与Run快照、批准来源 | 不声称复刻分类器、第三方API或全部模式；不靠前端隐藏确认放行 |
| Supervisor / Pi适配 | 已安装Pi0.87.1公开工具工厂与Operations、原delivery/claim/recovery | 原链路直接复用，新增批准状态不绕过执行前校验 | 发行包docs/extensions.md明确扩展与Pi同OS权限；不可搬进扩展充当宿主隔离 |

## 完全访问的下一实施矩阵

这是未完成工作，不由本批通过自动晋级：

1. 明确宿主拥有的执行策略：哪些工具可访问目录外、是否开放网络、哪些应用数据/凭据目录始终禁止。完整访问不等于Worker可访问产品库；Renderer仍不能传可执行文件、任意环境或数据库路径。
2. 复用guardian与Mac执行后端实现实际范围，保持任务取消、父进程死亡、后代清理和收据。Worker原生Session/凭据代理继续隔离，不能为工具权限顺带开放Pi扩展发现。
3. 工具目标解析、版本/参数摘要、外部副作用核实、可登记成果范围同步适配。不得仅改sandbox字符串让产品路径校验与实际执行不一致；无法对账仍unknown，不自动重发。
4. 用受管理临时目录和loopback逐项证明：目录外的批准文件可访问、网络策略确实生效、测试宿主SQLite及凭据canary仍不可读写、取消/宿主SIGKILL后的固定后代已停、模式重开及旧Run快照正确。其他平台未通过即不支持，不静默放宽。
5. 通过后才显示真正可选择的第三档。当前两档仍是受限工作目录内的选择，不宣称三档交付完成。

UI-01/02与SEC-02保持in_progress，整个工作台目标、完整人工体验、会话命名/全文/Markdown等既定事项继续保留。
