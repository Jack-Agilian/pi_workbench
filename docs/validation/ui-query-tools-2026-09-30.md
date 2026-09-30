# Q1 工具查询迁移与连接隔离

2026-09-30。开工fetch确认develop仍为`96768a6293838f5c56395a5f1689672018bb1e28`，先将已提交F01/F02和规划四个提交快进集成至`46449024d31b0ce4601c971b90b8c036f88a27a7`；推送后独立ls-remote确认同SHA。Q1在用户指定worktrees/develop中新建`codex/ui-query-tools`，代码提交为 **5b10b19fb608159a37459592b265c6392d0d5331**。原有AGENTS.md修改保留未提交；本报告及SSOT维护为后续文档差异。

## 带来的变化与复用收益

工具记录的缓存、并发重复读取、加载/错误状态和逻辑取消由TanStack Query承担。读取失败保留已发布内容，自动轮询不会反复重试工具错误，用户可手动重试；当前审批与停止仍由独立活动快照驱动。断网不暂停本地查询。重连后重新读取到之前浏览的位置，旧连接结果不能混入新缓存。

直接依赖`@tanstack/react-query` **5.104.0**，唯一npm锁固定其`@tanstack/query-core` **5.104.0**。复用根级运行时导出`QueryClient`，通过公开实例方法`query/getQueryData/getQueryCache/isFetching/removeQueries/cancelQueries/clear`接入；QueryCache.subscribe供React `useSyncExternalStore`读取加载与错误状态。所选发行声明已将fetchQuery标为deprecated，因此采用公开query方法，没有deep import、私有补丁或安装脚本。测试额外使用公开QueryObserver/focusManager/onlineManager；本轮没有使用useInfiniteQuery或复制示例应用源码。

删除工具范围的`LoadedRange<OperationView>`缓存/复制及Renderer工具分页自管busy/error路径。ThreadPages.operations现在只存查询键，不存第二份工具数据；页面组合视图是不可变展示结果，不可写缓存。保留产品事件到Run的失效表、串行批次提交/水位、页游标和恢复最旧记录位置的适配；历史/成果LoadedRange仍留待Q2。新增OperationQueries不是通用查询框架，仅封装这一类产品只读查询。

本次不以减少代码行数宣称收益：连接身份、显式错误策略和回归增加代码；减少的是工具数据缓存、请求合并、异步状态及逻辑取消需要自行维护的职责。批次屏障和游标遍历仍由产品负责，库不能替代这两者。

## 一致性和身份

- 查询键含宿主生成的不透明连接UUID、Thread、查询种类、Run、发布批次及旧页游标。UUID每个实际HostClient连接重新生成；不含路径、账户或凭据，不具授权能力。
- `workbench:query-scope`沿用可信主窗口来源检查并拒绝参数；home附带当前连接身份供Renderer发现宿主替换。工具查询携带期望身份，HostClient在发送前及返回后校验，旧身份不能改读新宿主。未新增自由数据库路径、工具执行或网络能力。
- 同一批次的新查询结果留在Query的新键下，全部成功后才切换产品引用及事件水位；失败保留原整批画面。成功后回收旧键；失败记录留作错误UI，显式重试开始时清理未发布键。
- 已浏览范围使用Infinity staleTime/gcTime，不自动驱逐可见旧页；明确关闭自动retry、retryOnMount、focus/mount/network-reconnect重取，networkMode=always仅用于本地读取。宿主重连走产品显式重同步。
- 新连接创建新QueryClient。只携带最旧记录的行标识，不携带旧Query数据、错误或promise；重新读到原位置。取消只中止逻辑等待和后续未发出的页读取，现有IPC没有物理取消接口，已发送的数据库查询仍可能结束。
- 工具读取按Run逐个执行，原主进程/HostClient的16个pending上限不变；64个变化Run的测试峰值为1个工具读取。审批/停止不等待这些历史请求。无事件轮询仍有原成本，不宣称无限历史/内存上限。

## 发行、安装和平台

实际registry/tarball/SRI/sha256、字节数、exports和源身份见[持久输入记录](ui-query-tools-inputs-2026-09-30.json)。两个包的SRI与registry及lock一致；逐文件核对已安装410/365个文件。官方tag `@tanstack/react-query@5.104.0`解析为`d4033eb1e5bdef3c8aa72a6cc614bcdd98b1ddca`，核对该提交两个package.json版本。MIT许可及署名进入THIRD_PARTY_NOTICES.md。没有独立验证发布签名。

沿用macOS27.0/26A428 arm64、Node24.21.0/npm11.19.0、React19.3.0、Electron44.4.5、Pi0.87.1与原声明补丁。只有新增两个Query包，其他锁条目语义逐项与基线比较一致。实际ESM根入口解析至发行build/modern/index.js，严格类型及Electron构建通过。

第一次直接npm install --ignore-scripts在既有安装目录内遇到npm arborist的ERR_INVALID_ARG_TYPE（from为undefined），未改变package/lock。随后相同npm用--package-lock-only写入精确版本，npm ci --ignore-scripts --offline成功，并显式运行原声明补丁与离线Electron准备入口；没有全局升级或放开生命周期脚本。

## 验证结果

所有产品测试均使用隔离临时profile/凭据、网络tripwire或既有平台隔离，模型响应为明确SYNTHETIC。真实模型请求 **0**，未读取或改写用户模型配置、账本、全局Pi目录。原始输出在`.artifacts/q1-query/`；SSOT引用本报告和已提交输入记录。

| 命令 | 结果和口径 |
|---|---|
| `npm run typecheck` | 退出0；完整严格类型及原Pi声明补丁 |
| `npm run test:desktop` | 38/38；既有32项和新增6项；真实Host/Worker/SQLite与合成端口分开 |
| `npm run test:backend-history` | 15/15，真实IPC分页/隔离/重连 |
| `npm run test:product-core` / `test:product-sdk` | 20/20、5/5 |
| `npm run test:pi-probe` / `test:pi-tools` / `test:pi-shell` | 15/15、19/19、4/4 |
| `npm run test:pi-resources` / `test:pi-auth` | 12/12、18/18；不是重新跑A3包下载探针 |
| `npm run test:desktop-ui` | 退出0；工具错误停止自动重试、手动恢复、慢工具页仍可审批/停止；三尺寸/锚点/草稿、60→61持久历史与真实重连、原确认丢失/关闭失败 |
| `npm run test:desktop-shutdown` | 24/24场景，包括退出、信号、清理证据缺失和恢复关闭竞态；合成Provider |
| `npm run test:desktop-model` / `test:desktop-file-agent` / `test:desktop-agent-shell` | 全部退出0，实际Electron与Pi，合成Provider |

既有64/256条历史的纯正文更新仍恰好events+historyEntry两次方法查询，工具/成果零读取。此计数不含独立home/activity轮询，不是LLM次数或IPC性能。真实IPC新增测试另记录首读/重开耗时，只有单次本机观察，不推导性能提升。取消/迟到、同ID跨连接、离线、焦点/联网/重新订阅、整批失败、缓存回收、64个变化Run背压及重连位置均单列断言。

baseline `4644902` 的test:desktop原32项也重新通过。test:desktop-ui首次工作副本失败在重连后61条历史恢复；原因是清空缓存时丢失浏览位置，修正为只携带位置并新增断言，未降低61条要求。第二次完整UI通过，运行开始于4644902加实现差异、结束时实现已提交5b10b19；被测代码与5b10b19一致。其余上表集中回归在5b10b19执行。

应用初始化重复执行：在5b10b19上两次`.venv/bin/python scripts/bootstrap.py --app --offline`均退出0，继续禁用lifecycle脚本、应用原声明补丁且不跑模型；之后`npm run prepare:desktop -- --offline`恢复同一校验过的Electron二进制。未另做新克隆验证。

文档检查在5b10b19加本轮文档差异执行：项目Python运行check-ssot.py 60/60、test-tools.py 15/15、check-docs.py --structural-only 5通过/2跳过、check-docs.py --typecheck 7/7，git diff --check通过。重复初始化后另跑typecheck和build:desktop，均退出0。此处持久摘要不依赖本机忽略文件。

## 边界与下一步

Q1完成限定工具查询范围，Q2历史/成果尚未迁移，未引入Virtual、durable、ORM、Provider网关或第二份原生历史。原169df60另一工作树两次UI超时仍未定位；本次UI通过不能关闭该历史项。Windows、PTY、完整真实模型桌面人工体验、生产发行和任意恶意代码隔离不在本轮验证范围。

UI-01/UI-02/ART-01保持in_progress，M0 Gate沿用原有限证据。当前唯一事项是Q1交付复审与develop集成准备，之后按计划进行完整真实人工检查，再依据证据细化Q2；本轮不自动把Q1合入develop或开始真实模型调用。

Skill评估：现有Context7查证流程仍有效；此次迁移涉及产品一致性和架构取舍，不是稳定的单用途操作流程，不新增Skill。可重复的验证保留在test:desktop和既有Electron命令中。
