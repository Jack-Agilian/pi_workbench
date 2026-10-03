# 会话持久命名：代码与限定验证

日期：2026-10-04（Asia/Taipei）。基线 `6093261cd4e13761406b92d78655a108d96e744d`，分支 `codex/ui-correctness`，实际被测代码 `98c323cab492256015484c131d1167e355715b82`。本报告在代码提交后编写，不把文档提交当作被测代码，也不宣称已合入develop。

## 新增用户能力

已有会话可在侧栏就地改名，重开后保留。轮询不覆盖输入，取消回到原按钮；名称发生冲突时显示最新名称并保留草稿，由用户决定是否继续保存。确认丢失可重试同一次请求，宿主重连的旧回复不能覆盖新状态。不同会话可以同名，身份仍以Thread ID确定。

复用原宿主事务、requestId确认、产品IPC、元数据轮询与定向刷新。只新增名称版本/命令和行内编辑组件；参考pi-gui固定sidebar/actions行为与React状态/清理文档，不复制SessionDriver。Pi0.87.1的`AgentSession.setSessionName`与`SessionManager.appendSessionInfo`为公开类方法；Thread可先于原生Session存在，此批不调用这些方法，避免为名称启动Worker或双写历史。完整映射见[命名契约](../ssot/thread-naming-contract.md)。

SQL v12在旧库增加title_revision，Worker IPC仍v11。排队/活动任务、审批、模式、资源和原生Session引用不随改名变化；改名不触发调度。无依赖/锁文件/声明补丁变化，无用户配置修改。

## 实际验证

macOS27.0.1（26A434）arm64；项目Node24.21.0/arm64、npm11.19.0、Pi0.87.1、Electron44.4.5。均为受管理临时workspace、产品库、Session和合成资源；网络隔离由既有驱动保留，模型响应/故障明确SYNTHETIC。新增真实模型调用0。

下列均在上述已提交代码SHA执行，退出码0：

| 命令 | 结果与范围 |
|---|---|
| `npm run typecheck` | 严格类型与既有Pi声明补丁检查通过 |
| `npm run test:product-core` | 27通过；新名称事务、规范化请求重试/ID冲突、版本冲突及改回同名、同名无事件、v11真实SQLite迁移、未知字段/控制字符拒绝 |
| `npm run test:product-sdk` | 5通过，原Session/绑定接缝回归 |
| `npm run test:product-worker` | 51通过；原进程/恢复/F01与v1/2/4/5迁移回归 |
| `npm run test:product-file-agent` | 34通过；v7迁移、真实工具与合成Provider回归 |
| `npm run test:product-full-access` | 11通过；v10迁移、私有SQLite拒绝、外部工具和取消/重开限定回归 |
| `npm run test:product-model-shell` | 39通过；v8迁移、实际Bash/文件和合成Provider |
| `npm run test:model-resume` | 16通过；含v6迁移与原恢复驱动，不是真实Provider续验 |
| `npm run test:backend-history` | 15通过，原分页/身份与进程恢复 |
| `npm run test:desktop` | 43通过；真实宿主排队改名不启动Worker、等待审批时改名保持原操作/原生引用、拒绝及产品库重开；名称事件只读events，不重拉消息/工具/成果页 |
| `npm run test:desktop-ui` | 实际Electron人工允许/拒绝/取消/崩溃、旧长历史/分页/三栏/预览与确认丢失回归通过；新增完整命名流程如下 |
| `npm run test:desktop-agent-shell` | 实际Electron三档、宿主授权、真实Bash/文件/审批、合成Provider及重连不重放通过 |

命名Electron检查：

1. 真实产品命令创建两个独立空Thread；程序化IME组合Enter不提交，Escape取消并恢复按钮焦点。IME事件是合成输入，不是中文输入法人工验收。
2. 编辑草稿跨宿主轮询保留；HTML样式字符串按文本显示，无图片DOM。1320/820宽度表单输入/按钮在窗口内，实际截图已查看；这不是完整无障碍验收。
3. 宿主已持久改名后合成丢弃确认，UI显示原请求重试。切到另一个Thread再确认，精确两次同命令只产生一个名称版本，不改变选择。
4. 真实并发产品命令改名造成版本冲突，原草稿保留；显式采用最新版本再保存，版本准确增加。
5. 持久提交后合成挂起旧回复，真实重启独立宿主；新连接允许确认原请求，旧回调不关闭编辑。最终名称版本4，两个测试Thread未创建Run/Operation。窗口重载后名称来自宿主库。

本批旧检查在开发前通过；代码加本报告/SSOT差异的最终检查使用仓库`.venv/bin/python`：`scripts/check-ssot.py` 60通过、`scripts/test-tools.py` 15通过、`scripts/check-docs.py --structural-only` 5通过/2跳过。没有重跑A1–A4独立探针、包获取/重复初始化、完整Electron退出矩阵或全部文档示例typecheck；前批证据不冒充当前SHA的新结果。

## 开发失败与修正

未提交开发阶段（上述基线加工作差异）保留以下失败：

- 新名称事件测试最初调用显式全量refresh，却断言定向poll；改用正式轮询入口，仍精确要求只查events和推进水位。
- 一份v3旧库夹具漏删新title_revision造成重复列；扫描并同步全部合成旧库重建（v1–v11相关），旧行/审计保留断言未删除，全部受影响套件最终通过。
- 取消编辑时立即focus仍禁用的按钮，实际Electron发现焦点丢失；改为DOM提交后在layout effect恢复，保留精确焦点断言。
- 新场景在上一改名确认后、元数据尚未刷新前立即再开编辑，按旧revision被正确拒绝；测试等待实际新名称后启动独立“挂起回复”场景。产品版本冲突规则保持。
- 命名流程通过后，旧命令重试测试仍用更早的总Thread数，因新增两条空会话失败。改在该场景开始前读取基数，仍断言只增加两条且重复请求不再新建。

最终两套Electron、类型与上述后端集中回归全部通过；没有通过放松权限/重试/事件数量断言掩盖失败。原始输出和截图位于忽略的`.artifacts/thread-naming-20261004/`；本文件是可随新克隆定位的脱敏摘要。

## 状态与未覆盖项

UI-01/02保持in_progress，原M0 Gate不变。持久改名批次完成，NEXT_STEPS唯一当前事项进入安全Markdown与按需原生全文阅读。自动语义标题、会话目录搜索/分页、原生Session名称同步、全文/Markdown、完整人工体验和其他平台仍未完成。名称/日期不用于伪造历史事件顺序。

Skill评估：本批是仍在演进的产品交互实施，不能固化为稳定、单一操作Skill；验证复用现有npm入口，不新建宽泛开发Skill。
