# 会话持久命名

2026-10-08文档归位：本文件保留业务/数据/进程契约及既有实施记录；位置、大小、布局、动效和控件呈现的唯一规格见[NAV](ui/shell/navigation.md)，后续相关改动在该节点维护。早期阶段的未实现/下一步陈述只属于当时范围，当前顺序以NEXT_STEPS顶部为准。

2026-10-04。产品Thread名称由App Server的SQLite维护；侧栏提供就地编辑，名称确认后在导航与会话标题使用。名称不是身份、权限、工作目录或Pi原生Session引用。

## 参考与采用边界

| 本项目模块 | 参考文件/API | 借鉴或替换范围 | 保留边界 |
|---|---|---|---|
| ThreadNavigation | pi-gui `163054227d370a49d09099c61eb65798481294ac` 的 [sidebar.tsx](https://github.com/minghinmatthewlam/pi-gui/blob/163054227d370a49d09099c61eb65798481294ac/apps/desktop/src/features/threads/sidebar.tsx)、[use-thread-actions.ts](https://github.com/minghinmatthewlam/pi-gui/blob/163054227d370a49d09099c61eb65798481294ac/apps/desktop/src/features/threads/hooks/use-thread-actions.ts) | 借鉴侧栏行内编辑、独立草稿和取消；没有复制社区组件，根MIT沿用既定核验 | 不采用其SessionDriver或命令权限；产品请求确认/冲突/连接身份由现有宿主链路承担 |
| React行状态 | Context7核对[按key保留状态](https://react.dev/learn/preserving-and-resetting-state)、[Effect清理](https://react.dev/learn/synchronizing-with-effects) | 行key固定Thread ID；草稿不随轮询覆盖；连接更换使旧异步回调失效；焦点在DOM提交后恢复 | 不增加全局表单库或第二套查询缓存 |
| Core/产品命令 | 已有事务、requestId去重和权限版本模式；Pi0.87.1公开类方法 `AgentSession.setSessionName`、`SessionManager.appendSessionInfo` 已查发行声明 | 新增产品 `threads.rename`；复用原产品事务和审计事件 | 两个Pi方法不是根函数导出；本批不调用：Thread可在原生Session前存在，不能为改标题启动Worker或双写原生历史 |
| ThreadPages/DesktopHost | 既有事件定向刷新和宿主产品命令入口 | 名称事件只推进事件水位，元数据轮询更新标题；改名不触发pump | 不重新拉全段正文、重放工具或修改原生Session |

## 持久语义

- `threads.rename`只接收requestId、threadId、title、expectedRevision及类型；未知字段拒绝。宿主校验非空、最多160个UTF-16代码单元、无控制字符或双向覆盖/隔离字符，规范化首尾空白。名称按普通文本显示，不解释HTML。
- SQLite v12只增加`threads.title_revision`（旧行0），原事务内检查版本、改名、增加版本并发出`thread.renamed`，同时持久保存原请求确认。同名提交只确认、不产生新版本或名称事件；不同会话可同名。
- 相同requestId及相同规范化命令返回原确认，不能再次改名；相同ID不同内容拒绝。不同请求的旧版本返回`title_changed`，包括名称改回原值的情形。请求确认不表示当前名称以后没有再被修改。
- UI保留未确认请求身份，用户显式重试；不自动重发。冲突保留草稿，等到最新名称版本可读后，用户选择“采用最新版本，保留输入”再保存。断开重连废弃旧回调，但保留原请求用于确认；切换会话不让A的迟到回复关闭B或抢焦点。
- Run、Operation、审批、资源、权限修订、工作目录和原生Session引用保持原所有权；改名不派发排队任务。Worker IPC仍v11，无新增Worker消息；Renderer不接收数据库路径/原生写接口。

## 范围与后续

[实际验证](../validation/thread-naming-2026-10-04.md)区分真实SQLite/Electron/Worker与合成故障。没有自动语义命名、列表搜索/分页、原生名称同步或全局唯一名称；未确认编辑只在当前窗口存活，重载/关闭后的持久名称以宿主为准。旧构建不能打开v12库，不做降级写入。

此批完成已有会话改名与重开保留；安全Markdown和按需原生全文为下一完整批次，UI任务及M0 Gate不据此扩大。
