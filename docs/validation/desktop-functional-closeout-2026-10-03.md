# 前后端真实桌面功能闭环收口

日期2026-10-03，macOS 27.0.1 arm64，项目Node24.21.0、Pi0.87.1、Electron44.4.5。延续[默认配置与首次失败记录](product-defaults-desktop-2026-10-03.md)，没有清空数据库、改变身份或重发未知副作用。本轮限定批准合成项目，不是任意用户项目/生产发行验收。

## 被测提交与执行入口

- 真实Electron四场景：`ebaf3162b0749c387def40887959f07e891ee706`。它包含7d14cfe默认配置清理和3eb88a1路径/工具失败展示修复。
- 展示措辞修正：`1a7514138c678bcde75dc1bc154d734f412c54eb`。
- UI测试等待修正：`68c63deafb70dd5b4b6b2a9c3531c9f70975799d`。生产执行逻辑未改变；文档提交不冒充被测代码。

首次恢复桌面时关闭了被操作工具误绑定的同工作树Electron默认窗口，再绑定实际Pi Workbench。第一次使用现有启动参数/隔离环境的临时薄入口加Chromium的`--force-renderer-accessibility`；只辅助可访问性，不改变产品权限或请求行为。正常退出后使用普通`npm run desktop:model`重开，未加该参数也能继续通过原生桌面工具操作；不把辅助参数设成产品必需配置。

所有发送、审批、停止、成果预览和退出操作均通过实际Electron界面完成，由代理操作，不称为用户人工验收。只读检查使用现有runEvidence、真实SQLite/原生Session及实际文件；没有直接注入完成/hostClean状态或绕过UI执行命令。模型为真实gpt-6-luna，原生记录API均为openai-responses，不检查endpoint背后的服务。

## 真实场景结果

| 场景 / Run | 实际HTTP数 | 结果与证据 |
|---|---:|---|
| 正常 `8d0a5106-b533-4944-b407-fa91c31b9652` | 5 | read data.md、Bash sh check.sh、write report.md、edit标题，四次独立允许、四个Operation均succeeded；Run completed，原生工具错误0 |
| 拒绝 `77dee7f4-6514-4892-87d3-c948ca705121` | 1 | write denied.md到达审批，点击拒绝，Operation denied、Run failed；目标文件不存在，无成果，不发后续请求 |
| 活跃取消 `b03eed7a-fb6a-4032-bb88-84ade7c55607` | 1 | 批准`printf started > cancel-started.txt; sleep 60; printf late > cancel-late.txt`；先核实started文件和执行中界面，再点停止。命令SIGTERM，Operation failed、Run cancelled；late文件不存在，清理完成 |
| 退出重开后继续 `3747e9d7-b5dc-47e2-a36e-416fce3a833b` | 1 | 原Thread/Session不变，要求不调用工具，正确回忆3、10、opal-desktop-03、# SYNTHETIC Verified；0 Operation、Run completed，报告内容/mtime未变 |

共8次真实HTTP，属于实际使用记录，不是新的请求额度。前一份报告的失败5次仍保留；原22条请求逐行摘要未变，目前总35条，活动/unknown Run为0。不计算剩余额度、可支付次数或新增预算。

正常与恢复Thread均为`c2e657b6-311b-49f7-9066-a3c09231cb49`，原生Session引用摘要均为`790adb52ed5e9ac7021fed1ddf320c837bb56552e6b56f81cf3f344b4cb223b4`。所有场景分别验证宿主清理收据及实际PID/进程组消失，不能据此推广到任意恶意脱组后代。

| 场景 | 清理收据SHA256 |
|---|---|
| 正常 | 870cdd0bb07e45c9aadf9c7debabef543da400d895938d6d1dcbd40260371a37 |
| 拒绝 | bce2d1249f18d50e58e046879c2476cedefe20d52201e99b2b4fc6955c4e624c |
| 取消 | 2f53d7212bbec64ede816c0e700ea2fa34e4069d0f5c4547e88e0dab61b837e7 |
| 恢复 | 196c655781109e42b1690fa64a2c6aab3e95c0e6f821155a1468265f4b18838b |

报告通过原生write和edit形成两个成果登记版本：60B草稿及63B最终版。最终文件SHA256为`5b18b856d064e0dd6c7dc18915e572643b3d271c1a67923b0cb8f647673ba4f1`。界面点击最终版显示核验一致及正确纯文本；点击旧版拒绝展示与该版本不匹配的当前内容。重开后再次核验/预览成功。README/data/check脚本与报告在恢复前后内容摘要、mtime均一致，拒绝目标/取消后半段文件持续不存在。两次正常退出均退出码0，真实产品库无残留占用。

## 反馈修复、复用与边界

| 项目模块 | 已核对参考 | 最小修改 | 保留边界 |
|---|---|---|---|
| model-error-view / run-history | [已有Pi错误采用契约](../ssot/model-error-contract.md)，固定Pi0.87.1 stopReason/errorMessage投影与现有产品ModelOutcome | 原生error也可能因宿主拒绝工具而出现；无HTTP状态/已识别代码时显示“模型流程未完成”，不推断服务失败。实际HTTP/代码仍显示 | 不改Pi、不增Provider错误解析器、不篡改旧记录；审批/结算仍由宿主负责 |
| artifact-panel | 已有宿主preview摘要比较、[指定时间线参考](../ssot/reference-implementations.md)的产品语义边界 | changed显示“当前内容与此登记版本不同”，不把同一任务的edit误称为外部修改 | 不推测修改者、不展示摘要不匹配内容、不另建成果存储 |
| frontend-smoke | 仓库smoke.ts已有按钮就绪等待 | 复用“先等待启用、只点击一次”，保留36条分页/焦点/审批/重连全部断言 | 不降低条目计数、不延长超时、不重试已发送操作 |

该组变化是产品语义/测试接缝修正，复用已固定的上游证据，不新增库API或复制社区源码。当前库版本/许可证不变；不启用Q2、Virtual、durable或新Harness。

## 集中离线回归与失败记录

1a75141：`npm run typecheck`、`npm run test:desktop`通过（39项）。首次`npm run test:desktop-ui`在frontend older_page超时；此前审批、成果检查已通过。测试原来在条目发布后直接调用可能仍disabled的分页按钮；生产组件的pageBusy在异步finally中清理，存在时序窗口。保留原失败，不将这一分析冒充其他工作树历史UI超时的已证根因。

68c63de：`npm run test:desktop-ui`通过完整实际Electron测试；`npm run test:desktop-agent-shell`、`npm run test:desktop-model`通过。均为明确合成模型/展示输入，零新增真实模型请求。新helper等待按钮可用后只点击一次，原页数/滚动/确认丢失/实际关闭失败断言均保留。正常、拒绝、取消和崩溃离线场景及安全错误展示均通过。

前一份报告的A1–A4、Worker/模型/文件/后台回归保留其原被测SHA；本次只修改Renderer文案和测试等待，不冒充全部后端在68c63de重测。本轮没有重新初始化或新克隆，没有跨平台、真实10/30分钟长流、任意恶意后代、生产打包和用户人工输入法/无障碍验收。

原始输出在`.artifacts/uncapped-cost-2026-10-03/`，本报告和证据清单是新克隆可定位摘要。当前真实链路通过不能把所有P0或完整产品标为完成。Skill评估：动态故障定位仍依赖现场判断；复用已有配置/审计/回归脚本，不新增泛化Skill。

收口检查：68c63de及本报告文档差异上，typecheck、check-ssot、test-tools、check-docs --structural-only均通过；diff空白检查和常见密钥模式扫描无命中。没有提交用户配置、凭据、即时输出或startup快照改动。
