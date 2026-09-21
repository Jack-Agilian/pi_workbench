# 从文档到可运行产品：复用优先

状态：当前计划，尚未实现。决策依据：[SSOT](../ssot/README.md)。工作项见 [backlog.json](backlog.json)；历史原始范围见[原始 Backlog](../startup/docs/08-delivery-and-references.md)。尚未创建 GitHub Issues。

## 1. 下一增量不是再造平台

**M0-A：Pi 公开 API 接入探针 + 最小桌面/产品契约。**先证明能复用，再逐步连接 UI，不先编写独立 Agent Runtime、技能解析器或工具库。Mock 保留为确定性测试与演示手段，不能成为另一套算法或伪造真实 Pi 事件。

| 顺序 | 工作 | 复用/差异 | 验收 |
|---|---|---|---|
| A0 | 选定发布包与运行时 | 固定 Pi 发行版本、tarball/lock，核对 exports/Node；源码 0.86.1 仅候选 | 正确 Node 环境可 import 已用公开符号；不依赖 experimental source 条件 |
| A1 | SDK Session 探针 | createAgentSession/SessionManager/Runtime | in-memory/保存恢复/订阅替换；原生记录不被产品库重写 |
| A2 | 基础工具接缝 | Pi 同名工厂、Operations、截断/diff | 包装前后语义一致；拒绝不执行；无旁路；取消与context不串 |
| A3 | 受控技能和包探针 | Pi Skill/ResourceLoader/PackageManager | 未批准 factory 不执行；resolve 不隐式安装；包安装副作用审计 |
| A4 | 凭据与模型探针 | ModelRuntime + CredentialStore | 前端只收到状态；登录/刷新/模型目录不另写；无密钥进日志/env |
| B | 最小产品协调与持久化 | 自有Run/Operation/Approval/Artifact，其他交给Pi | 幂等、事件快照、取消清理和unknown状态；没有第二套Session树 |
| C | Electron/React工作台 | 定向选 pi-gui/OpenPi 组件，验证后局部移植 | timeline/composer/工具卡/审批/成果；新环境可启动，保留来源和许可 |
| D | Mac闭环 + Windows执行竖切 | 现成Shell/PTY库 + 必要OS监督 | 中文路径、终端resize、进程清理及应用退出；跨平台不靠字符串替换 |
| E | 本地技能库与精选目录 | Pi内容模型 + 产品启用/快照/安装事务 | 普通SKILL.md可导入，更新不改变活动Run；未知可执行插件不开放 |

A0–A4 是 BOOT-03 / CORE-02 范围内的小型可行性探针，不等于提前完成全部工具、包管理和安全工作项。生产级 CORE-04 仍需 BOOT-05 平台验证，PKG-01/02 的完整市场安装交付仍为 P1；探针只提前揭示依赖能否复用。

A0–A4 的无模型部分可以与 B/C 的 Mock 视图并行。真实付费模型调用须有账户与费用授权；不调用 Provider 的导出/资源/文件工具测试不能声称验证了模型行为。Windows不等Mac全功能完成才验证。

## 2. 暂定目录：减少不必要拆分

```text
apps/desktop/            # Electron/React
apps/agent-server/       # 一个模块化宿主，含产品/资源/审批/成果模块
packages/app-contracts/  # 可校验跨进程DTO
packages/pi-adapter/     # Pi公开SDK与Operations薄适配
packages/platform/       # OS/PTY/进程监督，依赖现成库
```

Mock/fixtures 先作为测试与开发入口。每个目录不必都成为独立发布包，不增加自研插件微内核、通用RPC生成器、Provider层或npm解析器。

## 3. 社区复用准入

`pi-gui` 优先考察 thin SDK driver、timeline/diff/terminal；`OpenPi` 优先考察 Customizations/资源配置与特权边界。只在固定提交、许可证和模块依赖核查后局部移植；不同时拼六套应用。Pi TUI组件不作为React组件使用。

Pi server/client/Chord/durable 按 [SSOT](../ssot/reuse-first.md) 记为评估项；发布、认证、持久化、平台和接缝能力证明前不替换SDK主路径，也不自研同功能框架。

## 4. M0完成定义

用户选目录/创建Thread，执行Pi或明确Mock任务，工具活动与审批可见，取消不谎报，生成一个实际存在的Markdown成果，重启显示真实恢复/中断状态。加入Pi后，UI不改业务模型；Pi原生Session、压缩、模型协议继续由Pi负责。

每个PR列出“复用了什么 / 只新增了什么 / 对应证据与测试 / 尚未验证的平台”。文档检查、真实SDK、真实模型与平台E2E分别记录。未完成任务不得改为done；远端提交必须独立读回确认。
