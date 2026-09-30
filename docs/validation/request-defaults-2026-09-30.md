# 产品请求次数缺省纠正（2026-09-30）

基线 `9333c850278bbf8ebfe437eaeba0fc38dd8779d0`，分支 `codex/agent-shell-mvp`。用户明确“不限制llm请求的数量”“默认不应该有这个配置”“要把测试限制和产品配置区分开”。这是产品/授权决定，不是模型测试证据。

## 实现

被测运行代码 `3181a5271d9817d5257fcc205270e2b3c8c00534`。产品模板移除maxRequests；maxRequests与fileTools.maxModelRequests缺省都不设次数上限，显式null兼容同义。数值形式仅保留历史/验证配置兼容，4/8次测试限制留在SYNTHETIC测试与旧验收驱动，不能作为普通产品默认。未改变Pi Loop、SDK版本、依赖、工具批准或自动重试策略。

请求/费用账本继续持久累计。新增独立的request-count策略修订，保留authorizationId与旧行；只能移除次数限制，不能借机改费用、期限、模型、工具或目录权限。旧timeout修订仍不能改次数。有限测试配置仍按数值拒绝超额；不限次数模式每次仍预留费用，费用不足拒绝。Run外围时间包络根据既有费用/单次保守预留推导，单请求总期限与网络空闲各自执行。guardian改为检查绝对截止，避免长Run包络超过32位timer延迟后立即退出。

UI显示请求次数不限，不要求用户填写次数字段。产品配置入口仍是仓库外的 `~/Library/Application Support/Pi Workbench/model.json`；没有新增测试配置给普通用户。

## 本机配置修订（零模型调用）

读取的是model.json，未读取auth.json或Provider凭据。原文件确有maxRequests=4、timeoutMs=300000且无独立idle字段。应用关闭且库无活动/unknown任务时，分别登记用户已批准的次数修订与期限修订：移除maxRequests，timeoutMs=1800000（30分钟），httpIdleTimeoutMs=300000（连续网络空闲5分钟）。授权身份、费用/输出、模型/endpoint、数据和工具范围保持原值。原配置和各修订候选以0600存于应用专用policy-revisions目录；这些文件不入库。

第一次维护脚本在写入完成后报ledger_changed：它错误比较了迁移前后SELECT *的摘要，实际旧库在ProductCore初始化时执行既有v7→v9迁移，新增request_id/request_seq列。没有把失败断言改成成功记录。随后独立只读核验：仍为4条历史请求、全部属于原授权、历史策略摘要均在修订链内、legacy请求ID和序号正确，累计预留0.137024 USD，最终配置摘要与最新策略一致。未建立迁移前后整行字节一致的证据；原字段保留的迁移测试另有合成回归。

## 集中验证与失败

完整逐命令摘要见 [输入记录](request-defaults-inputs-2026-09-30.json)。3181a52上12条命令中11条通过：typecheck、model-resume 13、product-model-shell 17、model-integration-offline 44、product-file-agent 34、product-worker 51、product-shell 28、model-network、desktop 20、model-config、file-acceptance 25。file-acceptance中的CLI处于有文档差异的工作树，覆盖dirty-tree门禁，不冒充干净工作树完整prepare。

新增重点：真实临时SQLite保留4条旧消费，显式修订后同Run继续28次并由费用上限停止；重复请求幂等、重开保留费用、期限修订不能解除次数、次数修订不能扩费用/工具权限；实际Pi+Worker+受限Bash连续6次SYNTHETIC模型响应，单独验证费用不足时第三次不出网；超过32位延迟的外围期限不造成guardian立即退出。配置初始化不输出次数字段，旧驱动拒绝超出原验收方案的不限次数配置。

唯一初轮失败为Electron smoke等待approval-removed超时。原因是下一审批可能在两次UI采样之间出现，测试不应要求所有审批瞬时为空。`52f0585cb75541680be4ea17dc146d96d4e00dc7`仅将测试绑定到刚批准操作的参数摘要，先核对宿主操作，再核验该审批消失；保留两次审批、实际副作用、失败/成功结算和重连断言。该提交typecheck与test:desktop-agent-shell重跑通过。

SSOT 60项、脚本15项、文档结构5通过/2跳过及完整文档类型检查均通过；证据与当前文档同步后再次执行SSOT/结构检查通过。

原始输出位于忽略的.artifacts/request-count；本摘要和输入记录可随新克隆定位。未重跑初始化、新克隆、所有A阶段或其他平台；真实模型调用0。MODEL-03/04仍in_progress，M0-Pi仍blocked，取消次数限制不构成真实工具任务完成。
