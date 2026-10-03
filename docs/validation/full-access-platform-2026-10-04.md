# 完全访问：macOS 执行策略基础

2026-10-04（Asia/Taipei；开发始于10月3日）。基线 `dc673ec82acf169311a307b6201ab195978e2fb4`；分支 `codex/ui-correctness`；实际被测代码 `376c06e028cfd1f0bc337daf274aa8e395b8917e`。本报告后续文档提交不冒充被测代码。未合入 develop。

本批完成平台前置增量，不是完全访问产品模式交付。界面仍只有人工/自动两档，协议仍拒绝 `full`；没有改变已接收 Run 的权限。全工作台目标、会话命名和安全正文阅读仍未完成。

## 新增与复用

- 新增宿主内部 `macos-access.ts`，将原 Worker/Bash 的受限 profile 生成收敛为同一函数；原生产启动仍使用相同范围。
- 新增未对产品命令开放的完全访问 profile：文件范围可超出 workspace；宿主私有目录禁止读取内容与写入，应用/运行时代码只读。仅允许宿主指定的进程临时目录例外，嵌套私有目录仍独立拒绝；保护根及祖先目录不能被移动来绕过路径限制。
- 区分工具直接 IP 网络与 Worker 禁止直接网络。完全访问 profile 同时拒绝 Unix 服务连接、Mach 服务查询、Apple Events，并限制跨沙箱进程操作。实测范围见下表；规则存在不构成全部 IPC 或恶意代码隔离证明。
- 继续使用原 `ShellExecution`、`spawnGuardian`、停止 Promise、固定 Node、空环境和清理收据。没有第二套 Shell 执行器、Pi 工具、任务协调器或 Session 历史。依赖、锁文件、SQL 和 IPC 版本未改变。

## 实施前参考与采用

| 本项目模块 | 参考文件/API | 采用范围 | 保留边界 |
|---|---|---|---|
| macos-access | [sandbox-runtime 固定源码](https://github.com/anthropics/sandbox-runtime/blob/9e93406ab2e0b6e9794624896f729560dc9445db/src/sandbox/macos-sandbox-utils.ts) | 参考拒绝规则的优先级、目录例外、祖先移动保护、同沙箱进程边界；基于现有 profile 小幅扩展 | 未安装/移植其包，不复制通用 glob、代理、Linux 或配置系统 |
| worker-launcher / ShellExecution / guardian | 原 B-IPC/D2-S 产品实现，Pi0.87.1公开 Bash Operations | 原进程所有权与清理、受限产品回归直接复用 | 新 profile 尚未从产品 Run 模式选择；不把合成执行策略测试当成真实模型或完整产品链路 |
| 权限入口 | 原[权限契约](../ssot/permission-modes-contract.md)、pi-gui会话/输入区参考 | 下一批沿用现有输入区和宿主权限设置 | 本批不增加 UI 按钮、Renderer 路径/执行器/环境入口 |

Context7查询 `/anthropics/sandbox-runtime` 的文件拒绝/允许与目录移动语义；滚动文档只作背景。GitHub contents API 独立读回固定提交的源码 blob `4c6a3a4dff35a6c11285247e08ca263e938aea5f`、[Apache-2.0 LICENSE](https://github.com/anthropics/sandbox-runtime/blob/9e93406ab2e0b6e9794624896f729560dc9445db/LICENSE) blob `fe95f74680c8c8023153ebaeceb8ce03e523d75a`，与本机已读文件的 `git hash-object` 一致。只参考规则设计，未复制第三方模块或引入发行包。保留当前固定后端是因为它已拥有本产品进程/收据/审批接缝，本批不需要另一个跨平台通用执行 runtime。

## 实际验证

平台：macOS 27.0.1（26A434）arm64，Node24.21.0 arm64/npm11.19.0；沿用Pi0.87.1和Electron44.4.5。目录、凭据、数据库和输出全部为明确合成临时资料；仅访问本机loopback，真实模型调用0。没有访问用户真实凭据目录/数据库。

`npm run test:execution-access` 在独立临时 cwd/空 Provider 环境运行7项：

| 检查 | 实际证据及限定结论 |
|---|---|
| 策略配置拒绝 | 缺私有/只读根、符号链接根、越界/整根例外及只读冲突均拒绝 |
| 真实Bash文件/SQLite | 目录外读写与改名、外部SQLite建库成功；私有凭据、嵌套凭据、真实测试SQLite打开/创建及硬链接失败；私有目录符号链接仍拒绝；只读代码不可改；私有/只读根及祖先移动失败；事后宿主读回原内容 |
| 网络差异 | direct下127.0.0.1/localhost IPv4 HTTP成功；brokered及原restricted拒绝；旧restricted仍禁止目录外写入。只测本机TCP/HTTP/localhost解析，不宣称外网DNS/TLS、IPv6或UDP已验证 |
| 活跃停止 | 同一个停止Promise；真实Shell组与固定子进程退出，外部文件mtime停止变化，收据标记副作用possible，不假报没有副作用 |
| Node SQLite缺口 | 固定隔离Node测试入口在`--allow-fs-read=* --allow-fs-write=*`下仍不能打开/创建私有SQLite，拒绝来自实际OS profile；不是只靠Node权限或“不导入SQLite” |
| Unix服务 | 独立测试Unix socket服务无连接，测试进程得到拒绝；不访问系统服务或密钥库 |
| 真实宿主SIGKILL | 独立合成宿主进程启动原guardian、固定待机Node子进程及Bash服务器后代。kill宿主后，guardian写真实清理收据；Shell组/子PID消失、原端口不可连、外部心跳停止，guardian随后退出。此项未创建Pi Session/产品Run，不构成完整App Server持久恢复测试 |

最终代码SHA上的集中回归：

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | 严格类型及原声明补丁检查通过 |
| `npm run test:execution-access` | 7通过 |
| `npm run test:product-worker` | 51通过，原真实Pi/Worker/SQLite路径 |
| `npm run test:product-shell` | 28通过 |
| `npm run test:product-file-agent` | 34通过 |
| `npm run test:product-model-shell` | 39通过，包含31秒Bash及无缺省验证额度；Provider为合成 |
| `npm run test:desktop` | 40通过 |
| `npm run test:desktop-agent-shell` | 实际Electron合成Provider链路及三尺寸检查通过 |
| `npm run test:model-network` | 原真实loopback transport、redirect拒绝与受限Worker OS SQLite/网络边界通过 |

原检查在开发前通过；文档更新后重跑 `python scripts/check-ssot.py`、`python scripts/test-tools.py`、`python scripts/check-docs.py --structural-only`（实际使用仓库`.venv/bin/python`）。结果：60、15、结构5通过/2跳过。没有重跑完整A1–A4、所有Electron退出场景或其他平台，不将旧结果记成本轮实测。

## 开发失败与范围

未提交开发差异基于上述基线：第一次测试宿主也包在sandbox-exec里，子进程再次应用沙箱得到`sandbox_apply: Operation not permitted`，1通过/4失败。改为复用既有`test:model-network`的空环境宿主组织方式，由被测子进程应用实际OS profile；未移除被测进程限制，也未弱化断言。测试宿主本身没有OS网络沙箱，代码仅发固定loopback请求；不能称为“所有测试进程均由OS保证不出网”。

增加Unix服务与宿主终止检查后，Unix socket因长临时路径触及Darwin地址长度而`EINVAL`，6通过/1失败；改为独立短受管理临时目录，后续7项及最终代码回归通过。这两项为测试驱动问题，保留失败，不计为产品隔离绕过。

原始输出在忽略的`.artifacts/full-access-20261003/`；本摘要是可随新克隆定位的SSOT证据。未提交运行时配置、数据库、截图、凭据或第三方源码。

尚需：产品Run权限快照及迁移、宿主私有目录集合绑定、真实Worker原生工具的外部目标/版本/摘要处理、外部副作用核实、产品库重开/断连恢复及桌面选择入口。当前profile函数只验证调用者传入的保护集；尚不能替代上述宿主集成。缺保护/不支持平台必须失败，不静默退回无约束执行。未证明任意恶意进程、TOCTOU/预存外部硬链接、全部Mach/IPC、系统级沙箱或跨平台生产能力。

CORE-04/SEC-02、UI-01/02、ART-01保持in_progress，Gate不扩大。Skill评估：权限接入与测试组织仍在演进，本批不固化为Skill；可复跑步骤已收敛为单一npm命令，后续完成真实产品接入再评估。
