# 从文档到可运行产品

状态：实施建议，不是已完成代码。以原始 [28 项 Backlog](../startup/docs/08-delivery-and-references.md) 为总范围，本次附带 [JSON 版本](backlog.json)，尚未在 GitHub 创建 Issues。

## 1. 下一个最值得交付的增量

**M0：可运行的 Electron 工程骨架 + Mock Runtime 任务闭环。**不是继续扩写说明书，也不先建设公开插件市场。

建议沿用已确认方向：Electron + React + TypeScript；App Server、Pi Worker、平台执行层分离。应用依赖必须在实施当时核验官方发布包、选定精确版本并提交锁文件，不沿用旧资料中的候选版本当作现状。

建议目录（本次尚未创建这些应用模块）：

```text
apps/desktop/                 # main / preload / renderer
packages/app-protocol/        # 产品事件和运行时校验
packages/app-server/          # Run、事件存储、审批和协调
packages/runtime-mock/        # 可重复故障/流式演示
packages/runtime-pi/          # 下一增量再接真实 Pi
packages/platform/           # CommandRunner / PTY / Workspace
packages/skill-library/      # 受控资源加载与版本快照
```

M0 验收：创建 Thread；发起 Run；展示流式消息与工具卡；审批允许/拒绝；取消；切换 Thread 不串流；模拟崩溃后显示中断；注册并预览一个已验证的本地 Markdown 成果。必须区分 Mock 与真实执行，不伪造模型调用或产物。

## 2. 第一批 PR 顺序

| 增量 | 工作 | 验收 | 关联 |
|---|---|---|---|
| A | 固定工具链、依赖锁、空壳与检查命令 | 新环境可安装和启动，记录未验证平台 | BOOT-01/02/03 |
| B | 产品事件 Schema、Run 状态机、Mock Adapter | 重复事件去重，旧 epoch 拒绝，取消与完成不竞态 | BOOT-04/CORE-03 |
| C | SQLite 迁移、Thread/Run/事件及恢复 | 单 Thread 不出现两个活动 Run，重启可重建投影 | CORE-01/03 |
| D | 三栏 UI、Composer、工具卡和审批 | loading/empty/error/blocked 状态齐全，IME 不误发送 | UI-01/02 |
| E | Pi Adapter、固定真实 fixture、资源白名单 | 创建/恢复/停止在真实版本上实测；不加载全局未知扩展 | CORE-02/SKL-01 |
| F | 双平台 CommandRunner/PTY 技术验证 | 中文路径、终端 resize、进程树终止留证 | BOOT-05/CORE-04 |
| G | 内置技能、本地技能库、版本锁 | 安装/启用/授权/运行分别可见，修改不影响活动 Run | SKL-01/02 |
| H | 选编市场最小链路 | 详情、安装、校验、失败回滚，无安装期任意代码 | PKG-01/02/UI-03 |

其中 A–D 可先不使用真实模型账户；E 需要真实模型测试时可能产生调用费用，须先明确允许使用的账户和预算。macOS/Windows 实测需要对应设备或已授权的 CI runner，不能用 Linux 结果代替。

## 3. 除 Git 推送之外可承担的交付

- **规格与任务管理：** 把 Backlog 转为 Issues/里程碑/PR 计划，补验收条件和依赖；远端写入仍取决于连接权限。
- **直接实现代码：** monorepo、Electron 安全 IPC、React UI、App Server、Pi Adapter、持久化、Mock 和测试夹具；通过受控提交/PR交付。
- **技能与市场：** SKILL.md 解析、资源白名单、安装事务、内容摘要、版本锁、作用域、权限差异与回滚测试。
- **产品交互：** 可运行页面与状态演示，比静态聊天截图更适合验证停止、审批、错误恢复和多任务状态。
- **测试与故障修复：** 单元/契约/迁移/端到端测试、事件重放、坏包样例、崩溃注入、日志定位、Review 和 CI 失败修复。
- **发布准备：** 双平台构建配置、依赖和许可证清单、签名步骤与发布检查表；证书申请、付费服务、对外发布及权限变更需要相应授权。

这些是可交付范围，不代表本次全部实现。不自动创建定时任务、不承诺会话外持续开发；每轮明确变更、测试和未完成事项。

## 4. 不应先做的事情

暂不扩大到开放上传的可执行扩展市场、付费交易、复杂多 Agent 编排、通用 Office 在线编辑器或后台无人值守发送。先确保 Stop、审批、恢复、资源白名单和成果真实性可靠。

## 5. 做完一个任务的定义

有代码或文档变更；有对应测试和实际输出；说明错误路径与恢复；新增依赖固定版本；声明平台覆盖和未测点；不泄漏凭据；有可阅读的提交或 PR；Git 发布只有在远端 SHA 核验后算完成。
