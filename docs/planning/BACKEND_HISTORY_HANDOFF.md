# 后端交接：运行边界与长历史

后端分支 `codex/backend-history-safety`，从 `develop@58d3130` 起步；实际代码/证据提交见分支历史。当前工作树负责App Server、Pi adapter、main/preload/HostClient、启动器与共享契约；不修改renderer/style，不合并其他工作树。

前端对接 [最小契约](../ssot/backend-history-contract.md)：

1. 使用 `historyPage` 读正文页，使用 `operationPage` 按Run读工具结果，使用 `artifactPage` 读真实成果索引。所有页 newest-first，按需倒序渲染，按ID合并。
2. `threadActivity` 独立提供当前Run和审批，不与已加载历史页耦合；workspaceStatus=invalid时提示该旧会话工作区失效，不能静默换成新选择的目录。
3. 页面cursor只用于翻页，snapshotSeq只用于事件补读。每种视图保留自己的事件水位；事件批次最多128条，读完再推进。重连重新取首屏/活动快照，不重放产品工具命令。
4. 预览复用现有preview；changed/missing/unavailable不伪造成新成果。非法cursor重新取首屏并保留用户草稿，不无限重试相同游标。
5. `npm run demo:agent-shell -- --dev-profile=frontend` 在前端自己的工作树运行稳定后端；当前API尚未合并develop时，先采用本分支同一契约提交再接入。不得复制一份不同接口。

验证命令：`npm run typecheck`、`npm run test:backend-history`、`npm run test:product-model-shell`，集成后追加原desktop/Worker/SDK及Electron回归。真实模型0；两线不复制真实账本。R01/R02和后端分页完成不代表前端滚动/虚拟列表或完整UI-P2完成。

本后端分支已同步后来进入develop的前端基线 `e0616040983bc4358c354e34986639341ec481c6`，保留其布局/滚动/成果组件。上述尚待前端接入专指分页消费，现有布局增量不再视为未实施；双方原证据SHA保留。后端分支尚未合入develop。
