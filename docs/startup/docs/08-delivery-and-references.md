# 08 · 开发启动、参考项目与验收

版本 0.1｜按可验收阶段推进，不在团队与预算未定时承诺固定周数。角色可兼任，但职责必须有人承担。

## 1. 项目借鉴矩阵

以下项目存在与功能表述已通过仓库一手资料核验；未运行 GUI 或逐行审计实现。仓库当前显示 MIT 许可，不代表其全部依赖、图标、字体和捆绑资源均可无条件复用。[S11–S16]

| 参考项目 | 重点阅读入口 | 借鉴模块 | 不直接照搬 |
|---|---|---|---|
| minghinmatthewlam/pi-gui | README Architecture；apps/desktop；packages/pi-sdk-driver | React 工作台、窄 IPC、Pi Driver 分层 | 不让产品元数据全部依附 transcript；不整仓合并 |
| heyhuynhgiabuu/openpi | README Architecture boundaries；AGENTS.md；DESIGN.md | Renderer/main/SDK 权责、宿主监督 sidecar | 不把第三方扩展安全边界当现成解决 |
| shixin-guo/picot | README；docs/DESIGN.md；tests/fixtures/pi-rpc | 打包 Runtime、会话体验、RPC fixture 思路 | 不复用个人全局凭据路径作为产品默认 |
| gustavonline/pi-desktop | README；FEATURE_MAPPING.md；RELEASE_CRITERIA.md | 扩展优先资源管理、运行状态与发布验收 | 不把 TUI 任意 UI 组件直接映射为 React |
| zosmaai/zosma-cowork | README；PRODUCT.md；TECH.md | 非 Coding 的任务与成果场景、sidecar 架构参考 | README 的广泛兼容表述需自己测试 |
| jmfederico/pi-web | README；plugin-api.d.ts；server-plugin-api.d.ts | 持久工作区、会话与界面分离、远程控制思路 | 其受信用户假设不适用公开多租户服务 |
| earendil-works/pi | SDK/RPC/Extensions/Skills/Packages 文档 | Agent Runtime、工具/模型适配、原生 Session | 不把项目信任、包元数据当强权限隔离 |
| Codex App Server 官方文档 | Thread/Turn/Item、请求和事件、审批 | 自有控制协议的设计参考 | 不假定本项目协议与 Codex wire-compatible |

建议从新仓库开始，以受控依赖方式引入 Pi；借鉴结构和交互，确需复用源文件时逐项登记固定 commit、原路径、修改内容、许可证与 NOTICE。这里没有随包复制任何上述项目源代码或品牌素材。

## 2. 为什么不整仓 Fork 一个 GUI

现有 GUI 的数据假设、Tauri/Electron 技术栈、凭据方式、会话模型和目标用户不同。整仓 Fork 能更快展示聊天，但容易把第三方发布与状态假设变成产品底层约束。先用原型验证可参考某一个项目；长期主线维持自有协议、数据与包管理。

## 3. 开发门槛

| Gate | 交付物 | 放行条件 |
|---|---|---|
| G0 架构与风险验证 | ADR、锁定 Pi/Node/Electron、Mock Runtime、双平台 CI、Windows 竖切 | 事件映射/停止/路径可验证；记录依赖与测试夹具 |
| G1 P0 闭环 | 任务工作台、宿主工具、审批、恢复、基础成果与内置技能 | 开发者可完成并审阅一次代码任务和一次材料任务 |
| G2 P1 资源生态 | 选编市场、安装事务、技能副本、更新/回滚、资源锁 | 故障安装不破坏旧版；无安装期任意代码 |
| G3 P1 工作流 | 一个只读 Connector、专家预设、一个 Office 输出链路 | 账户隔离、成果校验、可解释资源与数据去向 |
| G4 P2 隔离与自动化 | 隔离后端、计划任务、撤销机制、无人值守策略 | 安全测试通过后才开放高风险扩展/自动化 |

G0 可并行做 UI 和平台；G2/G3 不应压过 G1 的 Stop、审批和恢复可靠性。公开第三方可执行扩展单独需要安全审批，不自动随 G2 放行。

## 4. 可导入 Issue 系统的初始 Backlog

| ID | 优先级 / 负责人 | 依赖 | 工作与验收标准 |
|---|---|---|---|
| BOOT-01 | P0 / Tech Lead | 无 | 冻结 ADR 与产品协议；未决项有 owner 和判定依据 |
| BOOT-02 | P0 / Desktop | 01 | 建立 macOS/Windows CI，打包空壳，签名链路可验证 |
| BOOT-03 | P0 / Runtime | 01 | 锁定 Pi 精确发布包与 SHA，保存原始事件 fixture |
| BOOT-04 | P0 / Frontend | 01 | Mock Runtime 驱动全部 Run 状态，无真实模型也可演示 |
| BOOT-05 | P0 / Platform | 02 | Windows 中文路径 + PowerShell/Git Bash + kill tree 技术验证 |
| CORE-01 | P0 / Backend | 01 | SQLite migration、Project/Workspace/Thread/Run、单写入与重启恢复 |
| CORE-02 | P0 / Runtime | 03 | Pi Adapter 创建/恢复/取消/最终状态，SDK 版本差异测试 |
| CORE-03 | P0 / Backend | CORE-01 | eventId/seq/epoch、去重、重连补发、投影重建 |
| CORE-04 | P0 / Platform | 05 | CommandRunner 与 PTY 分开，取消后无子进程/占用端口 |
| SEC-01 | P0 / Desktop | 02 | CSP、IPC 校验、Renderer 无文件/Shell/secret 直接访问 |
| SEC-02 | P0 / Security | CORE-02 | 宿主工具 Broker、审批绑定参数/epoch，过期审批拒绝 |
| SEC-03 | P0 / Desktop | SEC-01 | 凭据安全存储、日志脱敏、配置导入预览 |
| UI-01 | P0 / Frontend | 04,CORE-03 | 三栏布局、Thread 切换、流式/错误/未知工具卡 |
| UI-02 | P0 / Frontend | UI-01,SEC-02 | Composer、Stop、审批、排队状态、IME 组合输入 |
| GIT-01 | P0 / Platform | CORE-04 | baseline diff、用户修改区分、非 Git 工作区可用 |
| ART-01 | P0 / Backend | CORE-01 | ArtifactVersion、hash、基础预览、外部修改和另存为 |
| SKL-01 | P0 / Agent | CORE-02 | SKILL.md 解析、显式选择、受控 ResourceLoader、3 个内置技能 |
| QA-01 | P0 / QA | 上述 P0 | 两条端到端验收、崩溃/取消/跨线程安全回归 |
| PKG-01 | P1 / Platform | SKL-01,SEC-02 | Manifest/安全解包/内容 Store/原子激活和失败回滚 |
| PKG-02 | P1 / Backend | PKG-01 | 签名选编索引、缓存、兼容过滤、撤销和离线说明 |
| SKL-02 | P1 / Agent | PKG-01 | 技能作用域、冲突、个人副本、测试和版本锁 |
| UI-03 | P1 / Frontend | PKG-02,SKL-02 | 市场/技能库分离、安装四步、更新权限 diff |
| CORE-05 | P1 / Platform | QA-01 | 多 Workspace 并发、Worktree 与写锁，事件互不污染 |
| CON-01 | P1 / Backend | SEC-03 | 一个只读 Connector、账户绑定、过期重连和审计 |
| ART-02 | P1 / Agent | ART-01 | 选一个 Office 格式，从生成到校验/预览完整链路 |
| PRE-01 | P1 / Product | SKL-02,CON-01 | 3 个专家预设和 3 个案例，创建前预览资源需求 |
| ISO-01 | P2 / Security | CORE-04,PKG-02 | 整个 Worker 隔离、网络/文件/秘密能力测试 |
| AUTO-01 | P2 / Backend | ISO-01,CON-01 | 时区/漏跑/重试/去重/待审批，离线行为明确 |

## 5. 第一条技术竖切

输入目录 → 新 Run → 受控读取 → 请求写入审批 → 写出 Markdown → 注册 Artifact → 用户预览 → Stop/关闭/重开恢复。全部沿真实产品协议走；先 Mock，再 Pi。先验证数据库、权限与生命周期，后美化市场。

Windows 竖切再加中文空格路径、PowerShell、Git Bash、两层 Node 子进程、终端 resize 和任务取消。任何必须使用管理员权限才能正常运行的设计都需要单独解释与替代方案。

## 6. 验收与证据

**契约测试：** 同一原始事件输入得到一致产品事件；累计工具结果不重复；最终状态识别正确；旧 epoch 被拒绝；资源只来自 lock。**数据测试：** SQLite 外键、迁移、投影重建、引用回收。**安全测试：** 恶意包/技能、越界路径、凭据、外部写操作。**平台测试：** 两台真实目标设备和已签名安装包。

拟定门槛而非既有结果：100 次模拟取消无残留进程；100 组重复事件重放无重复成果/审批；每次注入安装故障后旧版本仍可用。实际 CI 记录设备、fixture、耗时与失败详情。LLM 成功率通过固定样例多次测量；不要用截图或单次演示替代测试。

## 7. 风险登记

| 风险 | 早期信号 | 缓解与放行依据 |
|---|---|---|
| Pi 快速变更 | SDK 类型或事件 fixture 变更 | 精确 pin + Adapter + 升级回归 |
| 默认资源污染 | 未启用扩展仍执行 | 自定义 ResourceLoader + negative tests |
| 不可信包执行 | 安装过程产生子进程/外联 | 内容安装器，不默认 npm install |
| 双写会话漂移 | SQLite 与 transcript 不同 | 原生会话单写、UI 索引可重建 |
| 跨线程覆盖文件 | 同 Workspace 同时写入 | 单写锁/独立 Worktree，明确共享缓存 |
| Windows 取消失效 | vite/node 遗留 | Job Object + 实机注入测试 |
| Office 质量不足 | 生成文件能下载但不可打开 | 输出结构与渲染验收一起交付 |
| 自动化重复副作用 | 超时后重复发起外部写入 | OperationIntent + 幂等/对账，不盲目重试 |
| 范围膨胀 | 先做支付/多 Agent/公开投稿 | Gate 管理与明确非目标 |

## 8. 团队责任

Tech Lead 维护 ADR、架构与版本；Runtime Owner 管 Pi Adapter；Desktop/Platform Owner 管打包、进程和 OS 边界；Frontend/Design 管状态与可用性；Agent/Artifacts Owner 管技能和成果；Security/QA 负责负向测试与发布证据。人少可兼任，危险能力上线不能无人评审。

每个 PR 说明：改变哪个协议/数据表/权限、是否涉及平台差异、是否新增依赖、如何回滚、哪些 fixture 更新。完成定义包含测试、错误/空态、权限解释、日志脱敏与文档更新。

## 9. 需要团队最终确认而不阻塞起步的事项

最终品牌、首批用户组成、最低 macOS 版本、Windows Git Bash 是否作为可选依赖分发、第一个 Connector、第一个 Office 格式、遥测政策、签名与商店策略。对尚未决定项给 owner 和关闭 Gate；不能把未决产品选择写成已确认事实。
