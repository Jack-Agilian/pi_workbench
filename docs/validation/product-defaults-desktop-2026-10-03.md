# 产品默认额度清理与桌面首次工具检查

日期：2026-10-03。环境：macOS 27.0.1 / arm64，项目Node 24.21.0 arm64、Pi 0.87.1、Electron 44.4.5。基线为 `5e1709d652dd4b8c01a4f74e8afb6091d7f175c3`；开工核对远端develop为 `ad92df2f295266bede18c3c33ed2a29ff4d39545`。工作分支 `codex/model-error-diagnostics`，没有改动其他工作树的未提交内容。

## 实现与采用

实际代码提交：

- `7d14cfe0d4e84e46782b30a35c28e8cab8475812`：产品默认取消请求次数、累计费用、输出512 token、操作/Bash次数、Bash固定30秒。用户本机配置通过同授权usage-defaults修订删除对应字段；请求/用量历史保留。
- `3eb88a1cac17bb2efe3d6c56fd7d7f185339762d`：真实使用发现的目录内绝对路径误拒绝与工具失败不可见修正，当前IPC v10。

复用现有ProductCore策略修订/请求账本、Node IPC/guardian、Pi公开ModelRuntime、Provider.streamSimple和原生read/write/edit。核对安装发行包SDK示例、settings及默认maxTokens行为，Context7固定版本结果的main片段不作为发行版证据。没有重写Provider、工具匹配、Agent Loop或Session；未增加依赖、安装或升级工具链。采用范围见[配置规则](../ssot/model-limits-contract.md)。

未指定输出覆盖时，省略maxTokens覆盖，由Pi/model元数据决定。不限次数且无费用门槛的工具Run不再推导整体截止；逐HTTP总超时/空闲、逐操作有效期、内部阶段监督和宿主断连清理仍有效。30分钟单LLM总超时和5分钟网络空闲明确为API检测。当前单操作有效期仍包含审批和执行的5分钟，与API空闲检测不同。

## 本机配置核验

配置迁移未读取auth.json或调用模型。保留原authorizationId和原22条请求行，迁移前后对原行的摘要核对一致。登记revision `product-defaults-20261003` 后保存候选，后续只读取非秘密配置指定字段确认：

| 字段 | 实际状态 |
|---|---|
| maxRequests / fileTools.maxModelRequests | 均不存在 |
| maxEstimatedCostUsd | 不存在 |
| maxOutputTokens | 不存在 |
| fileTools.maxOperations / shellTools.maxCommands | 均不存在 |
| shellTools.timeoutMs | 不存在 |
| timeoutMs / httpIdleTimeoutMs | 1800000 / 300000 |

旧有限配置字段保留兼容；明确SYNTHETIC的有限测试仍验证原拒绝行为。历史固定八次的validate:file-agent是单独的旧验收驱动，不是普通桌面配置或当前续验入口。未删旧账本、换身份或换库。检查不再输出剩余额度估计。

## 实际运行的离线检查

使用项目固定Node与已有`.venv`。以下均为真实SDK/文件/进程配合明确合成Provider输入，真实模型次数为零；不是外部模型或人工桌面验收。

| 被测代码 | 命令 | 结果 |
|---|---|---|
| 7d14cfe | npm run typecheck | 通过 |
| 7d14cfe | npm run test:model-integration-offline / test:model-resume / test:desktop | 分别66、16、39项通过 |
| 7d14cfe | npm run test:product-worker / test:product-file-agent | 分别51、34项通过 |
| 7d14cfe | npm run test:product-model-shell | 34项通过：含44条实际批准Bash/45次合成HTTP、默认输出超过512、31秒Bash完成及无整体截止时的宿主终止/阶段监督 |
| 7d14cfe | npm run test:product-shell | 初轮27通过/1失败，随后同SHA单独重跑28通过；见下方失败记录 |
| 7d14cfe | npm run test:pi-probe / test:pi-tools / test:pi-shell / test:pi-resources / test:pi-auth | 分别15、19、4、12、18项通过 |
| 7d14cfe | npm run test:product-core / test:product-sdk / test:backend-history / test:file-acceptance | 分别20、5、15、25项通过 |
| 7d14cfe | npm run test:model-config | 模板不含请求/费用/输出限制，重复初始化拒绝覆盖，合成凭据与真实Electron启动检查通过 |
| 7d14cfe | npm run test:desktop-agent-shell / test:desktop-model | 离线Electron通过 |
| 3eb88a1 | npm run typecheck | 通过 |
| 3eb88a1 | npm run test:product-model-shell / test:pi-tools / test:product-file-agent / test:product-worker | 分别35、19、34、51项通过，新增目录内绝对路径原生read/write/edit成功、目录外写拒绝和安全工具失败提示 |
| 3eb88a1 | npm run test:model-integration-offline / test:backend-history / test:desktop | 分别66、15、39项通过 |
| 3eb88a1 | npm run test:desktop-agent-shell / test:desktop-model | 离线Electron通过 |

原始日志位于本次忽略目录`.artifacts/uncapped-cost-2026-10-03/`；本文件为可随新克隆定位的脱敏摘要。Shell初轮取消检查在读取进程组前目标已退出，`ps -o pgid=`失败；耗时异常，原因未定位，不能断言主机睡眠所致。保留失败，未放宽断言；同代码独立重跑通过也不能证明根因已解决。开发中的临时类型错误已在提交前修正，不作为通过记录。

## 真实桌面尝试：未通过完整工具流程

被测代码7d14cfe，代理通过桌面自动化实际发送一次合成项目任务，由Pi循环产生5次真实gpt-6-luna HTTP请求，实际API为openai-responses。不是用户人工操作；只使用既有批准目录、合成README/data/check脚本，无敏感项目数据。

Run：`0cc91513-e6b9-42a2-a32f-c16dd3f31802`，Thread：`8ac85244-839f-4f60-b6a0-5cf2c57b27e8`。请求要求读取data.md、执行sh check.sh、write报告再edit标题。

- 模型给read/write/edit传入工作区内绝对路径，旧薄适配在审批前拒绝，4条工具错误；另有读取非Markdown脚本的尝试，不放宽文件类型边界。
- 唯一进入宿主审批的Bash经允许后成功，输出`SYNTHETIC count=3 sum=10 marker=opal-desktop-03`。
- 模型最终声称完成，但report.md实际不存在，0成果。Run=completed只表示本轮模型及已拥有操作结算；不能把模型陈述当作文件成功。原界面未显示审批前工具失败，已据此修正。
- 真实退出/组清理收据已核对，原生引用摘要`927c0aa750a04fcaaa761571702bdf032a47e4b60fc30504a98bc8c494d4d82a`；收据摘要`3d19c9557ccbbf47f20ffa68b337c3d381e98c81c3a17afe6ab658e21b969569`。

3eb88a1将工作区内绝对路径规范化后再计算审批摘要，目录外拒绝保持；新增固定产品工具失败提示，不透传原始SDK对象/错误文本。离线回归通过后，桌面操作工具出现窗口识别异常，未重复发送真实任务；修正后的真实read/write/edit、拒绝、活跃取消及重启恢复组合尚未执行，不能记为通过。

## 状态与后续

前端和后端属于同一条功能主线：桌面展示/输入，App Server准入/审批/结算/恢复，Pi Adapter/Worker调用与工具接入都可按实际问题修正。当前唯一事项仍为完整真实桌面功能链路验证与修复，不启动Q2、Virtual、durable、PTY或市场。各Gate和任务已有限定状态不因本轮测试数量晋级；Windows、生产发行、任意恶意后代、真实长流30分钟未覆盖。

Skill评估：本次含动态桌面故障定位和授权变化，尚不是稳定单一流程，不新建Skill。配置修订及审计继续复用已有脚本；无需再创建平行工具或手工修改产品数据库。

## 文档收口检查

3eb88a1代码加本文所列文档差异上执行`.venv/bin/python scripts/check-ssot.py`、`.venv/bin/python scripts/test-tools.py`、`.venv/bin/python scripts/check-docs.py --structural-only`全部通过。`git diff --check`通过；本轮新增/修改文件的常见密钥模式扫描无命中，未跟踪.artifacts、用户配置或凭据，docs/startup未修改。本节不是新代码SHA的模型重测。
