# 会话查找与目录分页契约

2026-10-08文档归位：本文件保留业务/数据/进程契约及既有实施记录；位置、大小、布局、动效和控件呈现的唯一规格见[NAV](ui/shell/navigation.md)，后续相关改动在该节点维护。早期阶段的未实现/下一步陈述只属于当时范围，当前顺序以NEXT_STEPS顶部为准。

2026-10-04。实现/证据见[本批报告](../validation/thread-directory-2026-10-04.md)。本契约扩展已有产品只读查询，不改变Pi Session、Run、审批、资源锁或执行权限。

## 用户行为

侧栏按名称或已登记工作目录查找，也可选定工作目录筛选。搜索按钮/Enter提交，输入法组合中的Enter不提交；清除/Escape恢复全部目录。按**创建顺序倒序**展示，不宣称最近活动排序。无结果、加载中、加载更多、读取失败与手动重试分别显示；不在已加载的局部列表中冒充全库检索。

选择的会话独立于搜索结果：过滤、翻页和失败不清空正文、输入草稿、审批或停止入口。当前会话和正在改名的会话若不匹配，标为“列表外保留”；同一React身份保留编辑器，命名冲突仍走原宿主修订/确认流程。新建成功的会话即使不匹配也保持选中。侧栏折叠不卸载这些草稿。

## 模块 → 参考/API → 采用范围 → 保留边界

| 本项目模块 | 已核对参考/API | 采用范围 | 保留边界 |
|---|---|---|---|
| `apps/desktop/thread-directory.tsx`、`thread-navigation.tsx` | pi-gui固定MIT提交[sidebar.tsx](https://github.com/minghinmatthewlam/pi-gui/blob/163054227d370a49d09099c61eb65798481294ac/apps/desktop/src/features/threads/sidebar.tsx) | 选择身份独立于分组/过滤、编辑时保持目标可达的行为；无新增源码移植 | 不引入SessionDriver、拖拽分组、原生树复制或第二套权限 |
| 同上 | 已安装`@tanstack/react-query` 5.104.0公开运行时`QueryClient`、`useInfiniteQuery`；[官方分页文档](https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries) | 单一目录页缓存、分页和异步状态；初始页参数/下一页游标 | 官方latest/main仅作语义参考；准确采用版本以本地声明/ESM和锁文件为准。不迁移无关历史/成果缓存 |
| `apps/agent-server/thread-directory.ts`、Core薄入口 | 既有`desktop-pages.ts`固定SQLite查询/keyset/字节上限 | 宿主持有元数据、参数化查询和游标校验 | 无Renderer SQL、自由数据库路径、文件扫描或Session内容索引 |
| `packages/app-contracts/thread-directory.ts`、preload、HostClient | 既有闭合DTO、exact、parsePageOptions、queryScope | 仅新增受限只读请求；重用连接来源和pending上限 | 身份不作为授权票据；查询不能产生Run/Worker或重放操作 |

实施前已读固定社区文件及Context7分页/取消文档，随后核对5.104.0的类型声明、根导出和实际ESM import。没有重新安装/下载依赖，没有将main当成发行证据；原Q1发行记录继续保留。

## 宿主查询

`thread-directory`只接受query/workspaceId/cursor/limit；query最多160个UTF-16单元、禁止控制字符、去除首尾空格；workspaceId必须已登记。默认16、最多32条，继续256000字节响应预算。参数化`instr(lower(...),lower(?))`匹配名称或工作目录；`%`/`_`为普通字符，ASCII忽略大小写，中文按字面匹配，不宣称完整Unicode大小写折叠。

创建rowid为稳定倒序键。游标绑定格式版本、完整过滤条件、目录revision和真实边界rowid；跨过滤/目录、缺失边界和旧revision均拒绝，不静默混页。查询在Core读事务中完成。revision为`count(threads)+sum(title_revision)`，依赖当前无删除/归档API及名称修订单调增长；以后新增删除/归档必须修订此契约。该标量仍扫描表，不是无限规模索引或性能验收。

`home.threads`只返最近创建的32条，并给出directoryRevision/threadsHasMore；正式侧栏使用分页查询。home的工作区、活动Run仍沿用原集合，**未全部分页**。权限模式变更不递增目录revision，当前会话有效模式仍由独立活动快照更新；不得从导航副本决定执行权限。SQL v13/Worker IPC v12不变。

## 页面、失效和恢复

Query key包含宿主连接queryScope、名称与工作目录。retry、focus/reconnect自动重取关闭，networkMode=always适用于本地IPC。新建/改名revision变化时从首页刷新已加载页链；失败保留旧内容并明确提示，用户手动重试。新过滤不将旧结果标为当前结果。后续页按钮在读取中禁用，使用同一Query页链。

取消信号与HostClient发送前/返回后的scope校验禁止迟到发布，但不能物理取消已发送IPC。编辑中的列表外行只用现有threadActivity补读元数据，仍校验连接并在effect失效时停止发布。它是编辑状态，不是另一套分页缓存。重连重新查询不执行工具、不重放产品命令。

## 范围

真实SQLite中1200条合成会话、真实Electron中75条合成目录及重连/故障已测；见报告逐命令SHA。未实现消息正文搜索、归档/删除、置顶、目录虚拟化、任意规模性能保证；宽/窄合成截图不是完整人工使用或VoiceOver验收。当前侧栏搜索与新建名称区的空间占用仍纳入最终布局复审，不因按钮在视口内就宣布紧凑度完成。
