# 安全Markdown与按需原生正文：限定交付

2026-10-04（Asia/Taipei）。基线`bc1658f3885002203de124b8b3c0b2a13b939d16`，分支`codex/ui-correctness`。实际被测代码 **`41345e8632b5deb4fd95c6d25c12460bb86e49e7`**；以下集中回归均在该提交之后执行。文档/证据是后续提交，不冒充代码实测；未合入develop。

## 新能力与采用边界

正文可以显示Markdown标题、列表、表格、引用、任务列表和代码块。用户可选择读取本次Run的原生正文，继续加载长消息及原摘要省略的消息，完成后明确标记可展示正文已读完；收起恢复摘要。读取失败、记录缺失/变化、未确认范围或超限均解释原因，不重跑模型或工具。

pi-gui固定提交的MessageMarkdown是主要参考，直接采用`react-markdown@10.1.0`与`remark-gfm@4.0.1`；新组件只做受限元素/资源策略与样式，没有自研Markdown解析器。Pi0.87.1根级`parseSessionEntries`和`SessionManager`实际ESM import为函数，公开类方法`inMemory/getBranch/getEntry`按发行类型和测试使用；没有deep import或声明逃逸。完整映射、身份与边界见[契约](../ssot/safe-reading-contract.md)。

新增SQL v13只保存每Run的原生文件/起止entry引用；Worker IPC v12的native-range是本项目消息。读取保持宿主Thread/Run校验、管理目录、连接身份与只读接口。Pi继续拥有消息树/JSONL及执行，产品库不复制全文；范围通知不作为进程清理/结算证据。正文与Operation仍分区，不编造穿插顺序。

整条消息先过滤已知凭据格式再分段；按16KiB UTF-8正文、最多16片段返回，不拆Unicode代理对。只投影用户/Assistant文本和固定工具失败说明，思考/附件/原始工具输出不会透传。原生文件读前后检查身份/修改信息，当前解析缓冲最多8MiB；超限返回too_large，不冒充完整内容。这是读取保护，不是模型用量预算。

原始HTML不执行，图片不发起加载，HTTP(S)地址只显示为可选择文字，其他协议不生成链接。没有新导航/文件打开权限。成功读取在该Run内替换摘要；关闭/切换/连接更换废弃旧回调，异步错误保留已读段落，显式重试沿原游标。沿原TimelineScroll保持阅读位置，外层shell不可被程序滚动移走。

## 发行与安装

[可定位输入记录](safe-reading-inputs-2026-10-04.json)包含真实registry URL、SRI、tarball字节数及sha256、安装文件核对。react-markdown 9个文件、remark-gfm 8个文件与tarball逐字节摘要一致；SRI同时与npm锁匹配。MIT署名和完整许可进入THIRD_PARTY_NOTICES。没有独立验证发布签名，main源码只作阅读参考，精确发行选择以实际registry/下载包为准。

macOS27.0.1（26A434）arm64，项目Node24.21.0/npm11.19.0、React19.3.0、Pi0.87.1、Electron44.4.5。原有锁条目版本未变、无包移除；新增解析器的传递依赖由唯一npm锁固定。

首次`npm install --save-exact --ignore-scripts --no-audit --no-fund react-markdown@10.1.0 remark-gfm@4.0.1`和锁定后的install均遇到npm arborist rollback的`ERR_INVALID_ARG_TYPE`（from为undefined），未放开scripts解决。`--package-lock-only`成功，旧项目node_modules保留至忽略的本批artifacts后，`npm ci --ignore-scripts --no-audit --no-fund`成功安装440包。随后显式运行原`npm run patch:pi-types`与`npm run prepare:desktop -- --offline`，验证已有声明补丁及固定Electron缓存SHA。未修改全局工具链或安装新的桌面框架。

## 被测代码上的集中回归

全部退出码0，隔离临时workspace/profile/Session，Provider、输入/大历史与故障明确SYNTHETIC；真实模型调用 **0**。下载阶段与离线SDK/产品测试分开。

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | 严格类型及既有Pi声明补丁通过 |
| `npm run test:pi-probe` / `test:pi-tools` / `test:pi-shell` / `test:pi-resources` / `test:pi-auth` | 15 / 19 / 4 / 12 / 18通过 |
| `npm run test:product-core` / `test:product-sdk` / `test:product-worker` | 27 / 5 / 51通过；IPC与旧库迁移、进程恢复/F01保持 |
| `npm run test:product-file-agent` / `test:product-full-access` / `test:product-model-shell` | 34 / 11 / 39通过；真实Pi工具/进程/私有SQLite与合成Provider，三档、取消/重开限定回归 |
| `npm run test:model-resume` | 16通过，含旧策略库迁移和恢复驱动；非真实Provider续验 |
| `npm run test:backend-history` | 19通过，包含本次4项真实Pi文件/SQLite/进程读取测试 |
| `npm run test:desktop` | 43通过；原审批/停止、改名、查询/断开及旧库迁移 |
| `npm run test:desktop-ui` | 真实Electron完整原场景、分页/布局/阅读锚点/成果/改名，以及新增安全阅读链路通过 |
| `npm run test:desktop-agent-shell` / `test:desktop-file-agent` / `test:desktop-shell` | 三套真实Electron文件/Bash/审批/重连流程通过，Provider合成 |

新增后端检查包含：用Pi公开appendMessage实际落盘22条可展示消息；长中文/emoji多页重组准确，省略消息可读、跨片段凭据不可拼回；前一/后一Run不混入；原文件字节和mtime不变，产品库没有保存正文。实际重开、跨Run游标/Thread拒绝、正文变化、文件缺失/符号链接/超限、错误cwd/起止ID、旧v12迁移无范围及失效绑定明确验证。独立真实Worker经新IPC记录范围，产品库重开后不再执行，原生文件不改写。

新增Electron检查包含：真实preload→HostClient→App Server→Pi原生文件读取；GFM表格、加粗、代码中的脚本字样按文本；无img/script/可导航a DOM、无example.invalid资源请求；丢失读取先显示只读重试，多页后能看到最后消息及完整尾部，已知token不显示，读取过程没有产品command。真实宿主替换时迟到读取被废弃；1320/820截图已查看，收起焦点返回，标题区域不随正文读取离开窗口。

两类模型资料均为合成；程序化Electron/键盘/IME检查不是用户人工体验或完整无障碍验收。没有重跑独立npm/Git包获取探针、重复bootstrap/新克隆或完整Electron退出矩阵。旧证据没有搬到本SHA冒充重测。

## 开发失败及修正

基线加未提交实现阶段，类型检查先发现historyEntry应通过item访问Run，已修正。首次后端/桌面回归暴露结束范围被错误插入工具授权前的publish路径，导致正式结束时重复通知并阻断结算；移除该处，只在执行结束后的最终展示之后发送end。原43项桌面及19项历史检查恢复通过，取消/拒绝/unknown结算断言未放宽。

首轮Electron检查通过后查看截图，发现测试scrollIntoView可能滚动overflow:hidden的外层shell并遮住头部；改为外层overflow:clip，测试只定位timeline并断言shell.scrollTop为0、头部可见。补读动作交给已有滚动所有者冻结阅读位置，未添加新的scrollTop写入者。随后完整Electron在开发阶段和被测提交上均通过。

宿主替换的合成故障截图还观察到：活动轮询恢复后，历史连接错误提示可能仍保留“重新连接”动作，直到用户显式处理。此批不把该观察当作已解决；下批整体工作流复审优先核对是否会误导用户再次重启正在运行的宿主。它不影响本批原生读取的连接身份隔离，也不能据读取成功就宣布全部恢复体验完成。

原始输出、安装备份、下载和截图在忽略的`.artifacts/safe-reading-20261004/`；SSOT引用本报告及持久输入JSON，不依赖本机忽略文件。未提交真实凭据/配置/运行库。开发前检查通过；收口实际运行`.venv/bin/python scripts/check-ssot.py`（60项）、`scripts/test-tools.py`（15项）及`scripts/check-docs.py --structural-only`（5通过/2按模式跳过）均退出0；27个startup快照摘要保持一致。

## 剩余范围与状态

UI-01/02、ART-01等仍in_progress，M0 Gate不变；U07/U08仅推进本报告范围，不关闭全部审核发现。旧Run缺少原生范围、超过8MiB Session、消息/代码复制、可点击外链、附件/图像、精确正文/工具穿插及完整人工/其他平台体验仍未完成。会话列表搜索/分页也不因改名或正文读取完成而自动通过。

NEXT_STEPS唯一当前事项转为整套桌面工作流复审与收口：按既有审核逐项核对当前实际界面、恢复提示、长正文/审批/停止和会话查找；明确余项再实施下一完整批次。整体工作台目标保持进行中，不自动合入develop或开始生产发行。

Skill评估：新增阅读/展示仍是产品设计实施，输入和边界尚在演进，不创建大而泛的开发Skill。npm安装恢复已第二次遇到同类故障，但当前缺乏该npm内部错误的稳定根因/跨环境验证，仍记录于开发报告，不能把移动node_modules固化为默认初始化步骤。
