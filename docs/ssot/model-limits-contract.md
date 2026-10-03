# 产品限制与验证配置

2026-10-03 用户明确“不限制预算”“后续不用推算剩余额度预算等，先把功能调通”。本契约覆盖早期文档中“真实使用必须有累计用量门槛”的描述；历史报告及测试输入不改写。

## 当前策略

- `maxRequests` 与 `fileTools.maxModelRequests` 缺省/null：不限制累计或单轮 LLM 次数；此前决定继续有效。
- `maxEstimatedCostUsd` 缺省/null：不设累计用量门槛。新产品模板不生成该字段，配置检查不推算可支付次数/剩余额度，桌面显示“费用不限”。已有显式数字仍作为可选有限策略兼容，合成预算耗尽测试继续保留。
- 每次真实 HTTP 的宿主身份、顺序、历史用量和估算记录继续持久化；不清空历史、不换授权身份、不换数据库绕过旧策略。移除费用上限不代表撤销服务商费用。
- 30分钟单LLM总超时、5分钟网络空闲检测用于识别上游API超时/停滞，**不属于预算或额度**，本次保留。
- 用户追加明确删除512输出token、8个操作、6条Bash、每条30秒：`maxOutputTokens`、`fileTools.maxOperations`、`shellTools.maxCommands`、`shellTools.timeoutMs`缺省不再强加这些值。输出交由Pi原生模型默认，工具次数不设上限；Bash只有模型显式给出timeout或已有操作有效期到期时才按相应时间边界停止。当前操作有效期仍含审批和执行的5分钟，不把它称为API空闲检测。
- 合成非敏感数据、批准工作目录、逐工具审批、凭据/进程/数据库隔离仍适用。测试次数和测试等待期限只约束对应测试驱动，不自动加入产品配置。

## 复用与最小增量

| 本项目模块 | 参考文件/API | 采用范围 | 保留边界 |
|---|---|---|---|
| Pi Adapter | 已安装 Pi 0.87.1 `examples/sdk/01-minimal.ts`、`docs/settings.md`；已有 ModelRuntime/Session 接入 | 继续使用原生 prompt、Provider 和用量；本次核对发行包示例/设置，没有引入新的 SDK 接口 | 产品用量门槛是 Workbench 策略，不冒充 Pi 必填配置；不改上游 Agent Loop |
| ProductCore / model-policy | 仓库现有 modelAdmission / reviseModelPolicy | 将费用变成可选门槛，增加仅取消费用上限的 `cost` 修订及一次移除验证额度的 `usage-defaults` 修订 | 原授权/模型/endpoint/数据/工具启用/API超时和账本保持绑定，活动工作禁止修订 |
| Host / Worker / guardian | 现有逐HTTP/逐操作监督和断连清理 | 不限次数且无用量门槛时，整Run `deadline=null`；IPC v9 引入此语义，当前IPC v10另增加安全工具失败投影 | 仅工具模型Run允许，单次HTTP/审批/工具仍有期限；旧在线IPC被拒绝；磁盘恢复仍读原记录 |

无整Run期限时，宿主监视自身持有的 HTTP/关闭过程及待处理操作；没有上述活动且 ready 后阶段转换停滞5秒即停止。该5秒只监督内部阶段切换，不是生成时间或人工审批期限。guardian 在宿主断连时继续终止 Worker 和受管理命令，不依赖累计费用估算。有限历史配置继续使用原有外围期限，不用巨大的数值冒充无限。

## 本机配置修订

关闭使用同一profile的桌面，保留原配置副本，在候选配置中删除上述验证额度字段，通过 `model:policy check-usage-defaults` / `apply-approved-usage-defaults` 登记同授权修订，再保存候选为应用 `model.json`。同revision-id幂等，不读取auth.json或调用模型。普通产品命令、Worker、Renderer不能修改该策略。

原始请求行保持不变；失败修订不得扩大其他权限。配置与账本更新中断时保留旧/新文件，显式修订可幂等重试；本次不新增第二套配置存储或模型账本。


补充发行核对：Context7 `/earendil-works/pi/v0.87.1` 返回的main片段不作版本依据；以安装包 `api/simple-options.js` 的 `buildBaseOptions` 为准，默认采用model.maxTokens并按上下文余量调整，Adapter不重写此计算；只通过既有公开provider.streamSimple省略maxTokens覆盖。自定义模型注册仍走公开ModelRuntime.registerProvider，所需maxTokens是能力元数据。没有安装新依赖或deep-import内部源码。

移除操作次数后，原128条控制消息/4096条HTTP消息的整Run累计门槛也不再作为隐式任务限次。逐消息大小、队列背压、来源/身份绑定及幂等仍有效；控制去重信息保留到本轮Worker释放，未实现无限长单Run的固定内存占用保证。长历史展示边界与工具输出截断仍独立于调用额度。

## 验证与当前使用状态

[实际提交、配置迁移与验证报告](../validation/product-defaults-desktop-2026-10-03.md)。当前本机配置已删除所有上述额度字段，原身份/请求记录保留；费用和次数不再作为本轮准入依据。有限字段仅供旧配置兼容及显式合成测试，`validate:file-agent` 的固定八次计划属于历史验收驱动，不是桌面入口，不用于本轮续验。

真实桌面检查发现工作目录内绝对路径在旧薄适配中被错误拒绝，已在审批摘要之前规范化；目录外仍拒绝，Pi原生read/write/edit算法不变。新增安全工具失败提示，模型声称完成不再掩盖已观察到的工具失败。该修正已通过实际SDK与离线Electron回归，真实桌面工具闭环仍待续验。
