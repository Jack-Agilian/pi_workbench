# Agent Shell：限定真实任务验收（2026-09-30）

基线 `83f2eb93e8a77fe014dcdeff7b2094603f3e3c40`，分支 `codex/agent-shell-mvp`。工具策略增量及首轮准入被测提交 `9488b70905f929d96a70671bafb6de4c2b41d19c`；严格schema兼容修正及真实成功被测提交 `688150f070797405250bb16ad3dc837bb0ddc64d`。后续文档提交不冒充运行代码SHA。

## 结果与授权范围

用户要求继续真实模型访问、取消LLM请求次数限制，并在澄清产品/测试配置后要求继续项目。本轮沿用应用已配置的gpt-6-luna、endpoint、私有凭据、原授权身份及$1累计估算预算；只发送新建专用项目的合成无敏感文件、工具输出和原生上下文。没有检查API地址背后的服务、发送业务项目内容、扩大账户权限或安装依赖。

将新增文件/Bash权限作为显式tools策略修订，复用原SQLite账本；只能更改已审定的工具范围，不能借此改请求次数、费用、期限、身份或模型。修订前后原4条请求逐行核对一致；真实任务结束后再次用旧行与策略链重建摘要，确认旧记录未变。maxRequests/maxModelRequests缺省不限次数；工具操作上限/30秒命令期限属于此次批准工具范围，不是LLM次数限制。30分钟LLM总期限/5分钟空闲沿用。

结果：正常任务、拒绝、活跃取消和重连后原Session恢复均通过。新增10次LLM请求，历史累计14次；新增保守预留$0.34256，累计$0.479584，剩余$0.520416。预留不是实际账单；Pi汇总usage亦只是目录价格估算。无自动网络重试。详情见 [输入与脱敏结果](agent-task-live-inputs-2026-09-30.json)，[实际生成的报告](agent-task-result-2026-09-30.md)保持原字节。

## 实际链路与逐场景证据

使用 `npm run validate:agent-shell -- --execute-approved agent-task-20260930-b <synthetic-workspace>`。该薄手动驱动复用HostClient→独立DesktopHost→Worker/Pi SDK→宿主逐Operation审批→guardian/Bash；不实现Agent Loop、工具协议或第二份Session。操作由模型提出，每条实际参数展示后由本轮执行代理核对并在终端批准/拒绝；未自动批准任意模型命令。首次normal目标自主选命令，取消场景固定命令仅用于证明活跃取消，不冒充自主任务。

| 场景 | 实测 |
|---|---|
| 正常任务，7次请求 | 模型先运行pwd/rg；rg在受限PATH中不可用，操作保留failed/127。模型收到真实结果后改用find，读取README.md/data.md，运行bash ./check.sh，收到CHECK PASS count=3 sum=10 marker=cedar-shell-30，再用write生成report.md。宿主核实摘要并登记1项Artifact。Run completed；不是把初次非零操作改成成功。 |
| 拒绝，1次请求 | 模型提出写refused.txt的Bash，实际发deny；Operation denied，Run failed，文件不存在。没有额外模型续轮或执行该命令。 |
| 活跃取消，1次请求 | 模型按专门取消提示提出“写开始标记→sleep20→写迟到标记”。批准后观察开始文件和executing状态才发runs.cancel；Shell SIGTERM，Operation failed而Run cancelled。开始副作用保留，迟到文件不存在；不声称取消回滚了已发生副作用。 |
| 原会话恢复，1次请求 | 实际关闭/重连宿主，复用正常任务的Thread和原生Session引用；无工具、无文件重写，准确回忆3/10/marker。report.md摘要和mtime保持不变。 |

重复runs.start和重复审批返回相同身份，未新增有效执行。每Run读取真实SQLite/启动日志与绑定清理收据，检查exited/groupGone及实际Worker/进程组退出；命令收据由原监督器独立核验。最终hostClosed=true、activeRuns=0。支持范围是固定受管理后代，不推导任意恶意脱组进程。

## 首轮失败与修正

9488b70首次真实入口在本机准入即failed，Provider请求账本仍4条、0次新增费用预留，未发生工具副作用；收据确认清理。没有把它算成功请求或通过样本。离线使用锁定Pi目录的gpt-6-luna和合成凭据/custom fetch复现：该目录模型启用strict工具schema；宿主按原始工具声明比较，拒绝model_tool_schema。此前自定义合成模型未启用strict，漏测此差异。

修正复用发行包公开exports `./api/*` 下的 `@earendil-works/pi-ai/api/constrained-sampling` → `makeStrictJsonSchema`（运行时函数），类型声明和实际ESM导入已核对。它仅生成宿主期望schema，与SDK发送的schema精确比较；不复制上游转换逻辑、不允许任意工具定义、不禁用严格模式。新增真实目录模型/实际Worker的SYNTHETIC响应回归，覆盖strict转换、optional null参数由Pi归一化，以及新增字段、additionalProperties放宽、未知工具均拒绝。

Context7按v0.87.1查询仍返回部分main材料，仅用于定位；版本事实以安装0.87.1的exports、公开声明和运行测试为准。没有deep-import src/core、修改上游、引入any或忽略类型错误。

## 验证与范围

9488b70：typecheck、model-resume14、product-core20、product-model-shell17、desktop20、SSOT60、脚本15、文档结构5通过/2跳过。688150f：typecheck、product-model-shell18、model-integration-offline45、product-file-agent34通过，然后一次集中真实四场景通过。CLI非法参数/非交互门禁亦以无凭据、禁网环境运行；实际交互驱动由四场景覆盖。文档同步后再跑SSOT60、脚本15、结构5通过/2跳过、完整文档类型7项，均通过。逐命令、SHA和日志摘要均在输入JSON；原始输出在忽略的.artifacts/agent-task-live。

macOS27.0/arm64、Node24.21.0 arm64、Rosetta=0。未重跑初始化/新克隆、完整A1–A4、Electron真实模型UI或其他平台；现有UI与edit工具沿用各自明确的离线证据，不冒充本次真实演示。真实任务包含read/write/Bash，没有要求模型选择edit。已有文件工具验收A01–A04覆盖read/write/edit与恢复；本轮补真实有限文件任务A05。

## Gate逐项核对

MODEL-03 A01–A04继续引用既有SDK/平台证据，A05补本轮真实有限文件任务及拒绝/取消/恢复；限定任务done。MODEL-04 A01–A03沿用原逐命令/恢复/目录/UI证据，A04补本轮模型自主任务；限定任务done。M0-Pi在M0-UI/M0-SDK既有passed前提下，补齐授权真实模型任务及Mac审批/取消/恢复，限定passed。此状态不代表完整产品、通用沙箱、人工中文输入法、Windows、PTY、市场或生产发行。

唯一后续为Agent Shell/M2交付复审与develop集成准备；本轮没有合并develop。通过复审后再安排UI-P2的历史/成果体验，不自动展开其他平台或市场。
