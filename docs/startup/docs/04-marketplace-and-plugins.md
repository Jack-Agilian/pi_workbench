# 04 · 插件市场与包管理设计

版本 0.1｜本章的 Manifest、Registry API 和权限字段均为本项目草案，不是 Pi 或 WorkBuddy 官方协议。

## 1. 先定义“插件”

Pi Package 可打包扩展、技能、提示模板和主题，通过 npm/git/本地源分发 [S05]。本项目在其上增加产品目录、权限、安装与审核，不 Fork Pi。

| 对象 | 本质 | 能否包含代码 | 与用户账户的关系 |
|---|---|---|---|
| Skill | SKILL.md 及引用材料、可选辅助脚本 | 可以，但不默认执行 | 不保存 token |
| Prompt Template | 参数化任务输入 | P0 不允许可执行表达式 | 无 |
| Agent Preset | 指令 + 技能引用 + 工具偏好 | 本身不含代码 | 引用 Connector 需求，不绑定他人账户 |
| Connector Definition | 服务能力和连接方式说明 | 可由第一方 Adapter 实现 | 独立 ConnectorAccount 授权 |
| Pi Extension | TypeScript/JavaScript 运行时模块 | 是，属于高信任代码 | 不得自动读取所有凭据 |
| Product Plugin | 上述资源的版本化发行单元 | 取决于组成 | 安装包与授权实例分离 |
| Marketplace | 发现、分发与治理目录 | 不是执行容器 | 可公开、组织或本地源 |

市场与技能库不是两套安装机制：市场负责“发现可安装资源”，技能库负责“管理本机已获得资源”。一个插件可以同时贡献技能、预设与连接器说明。

## 2. 信任等级与首版边界

**T0 审核内置资源。** 与 App 一起签名发布，按版本测试。**T1 选编内容包。** SKILL.md、静态模板、预设、参考材料；安装过程不执行脚本，使用时仍有提示注入风险。**T2 可执行包。** 任意扩展、辅助可执行程序或安装期代码；P0/P1 公开目录不开放，开发者可在独立测试配置中导入并明确承担风险。

签名证明来源与未篡改，不证明无恶意。技能只有 Markdown 也可能诱导模型调用危险工具，因此不能仅靠文件后缀判定安全。Pi 官方明确警告扩展与技能具有实际系统风险 [S05][S07]。

## 3. 包格式

```text
weekly-report/
  workbench.plugin.json      # 产品 Manifest，本项目定义
  package.json               # 可选 Pi 资源声明；内容包无需安装依赖
  skills/weekly-report/
    SKILL.md
    references/output.md
  presets/report-writer.json # 可选声明式预设
  README.md
  LICENSE                    # 公开发布前必须补齐
```

Manifest 至少包含 schemaVersion、全局 packageId、version、publisher、license、compatibility、contributes、requestedCapabilities。资源 ID 使用 `packageId/resourceId`，显示名称不能作为主键。支持平台表示经过测试的组合，而不是包作者随意声明后即获可信徽章。

Registry 中的发行条目另存下载地址、不可变摘要、包大小、签名元数据、审核状态和撤销状态。**包摘要不放回它自己所覆盖的压缩包内**，避免自引用；签名覆盖外部发行元数据或定义清楚的规范化 payload。

实际最小 Schema 见 `contracts/plugin-manifest.schema.json`，对应例子在 `examples/weekly-report/`。Schema 只能检验结构，不能替代归档解包安全、许可证审查、路径校验与运行隔离。

## 4. Registry 架构与 API 草案

P1 选编版采用签名静态目录、对象存储与版本化撤销列表，不必先建投稿后台。用户搜索可先用缓存索引，本地按类别、语言、平台和兼容性过滤。热门排序与下载量不是安全依据。

```text
Publisher 提交 -> CI 校验/测试 -> 人工审核 -> 签名发行元数据
                                            |
                        Registry Index + Artifact Store
                                            |
                 桌面 CatalogCache -> PackageInstaller
```

| 接口草案 | 含义 |
|---|---|
| `GET /v1/catalog?cursor=&query=&platform=` | 分页目录与兼容信息 |
| `GET /v1/packages/{id}` | 包详情、作者、资源和权限 |
| `GET /v1/packages/{id}/versions/{version}` | 不可变版本元数据 |
| `GET /v1/revocations` | 撤销、阻止新运行、建议处理 |
| `POST /v1/submissions` | P2 投稿，P1 不实现 |

桌面代码通过 RegistryAdapter 使用这些概念，静态版不必真的提供全部动态 API。企业私有源使用同一目录模型，增加授权、命名空间和组织策略；禁止默认把私有源内容上传到公共搜索。

## 5. 安装事务

```text
discovered -> resolving -> downloading -> verifying -> staged
           -> installed_disabled -> enabled
任一步失败 -> failed；旧 activeVersion 保持不变
```

1. 解析稳定 packageId、精确版本、依赖图和平台需求；禁止依赖环，拒绝无限版本范围。
2. 展示安装来源、代码组成、申请能力、目标作用域与必要账户。
3. 下载至 staging，校验长度、摘要、受信签名与撤销状态。
4. 安全解包：拒绝绝对路径、`..`、符号链接逃逸、设备文件、归档炸弹；限制文件数、总大小、单文件大小。
5. 校验 Manifest、所有被引用文件、Skill 元数据、许可证与依赖内容；不在应用进程执行 postinstall。
6. 把包放入按摘要寻址的不可变 Store，数据库事务注册为 installed_disabled。
7. 用户选择启用范围，单独授权必要能力；新 Run 构建锁定快照后才使用。

下载 URL 应限定 HTTPS、可信发布源和可接受重定向；自定义私有源需单独配置，防止访问本地元数据或敏感内网端点。开发者本地导入通过文件选择器，不给远程 Manifest 任意文件读取能力。

## 6. npm / git / 本地源的兼容策略

**内容型 Pi Package：** 读取 `package.json.pi.skills/prompts`，安全复制资源；不运行 npm 安装。**代码型 Pi Package：** 标记需要可执行扩展能力，进入隔离测试/审核，不用同一按钮直接安装到正常用户 Worker。**Git：** 固定 commit SHA，不依赖可变 branch 或可被重打的 tag。**本地目录：** 默认复制快照，开发模式才允许监视原目录；该模式明确显示“不具备内容不可变保证”。

Pi 自身具有安装和配置管理，但官方包文档说明 npm/git 包可能触发依赖安装 [S05]。本产品不把任意 Registry 条目简单拼接为 `pi install <url>` 执行；安装器与资源加载分开。

## 7. 权限模型

权限分三层：Manifest 的 requestedCapabilities、用户或组织实际 grants、某次 Run 的 effectiveCapabilities。运行有效权限取策略交集，任何层级都不能扩大组织 deny。技能里的 allowed-tools 字段是实验性元数据，不能当作 OS 权限 [S10]。

权限应指向受控资源，例如 workspace.read、run-output.write、connector.read、connector.write，而不是直接给“所有文件”。自由 Shell 是高风险能力，运行任意命令本质上可能绕过应用级文件约束；受控本机模式只做审批与审计，不宣称强隔离。

**四个独立状态：** 安装包落盘；启用资源可被解析；授权允许宿主执行某类操作；加入任务固定本次版本与权限。市场详情页必须解释这四者。

## 8. 升级、回滚、卸载

升级下载新版本后计算内容 diff、Manifest diff、能力 diff、依赖 diff。任何新增能力、可执行代码或执行方式变化都重新要求授权；不得只按 semver 判断安全。纯内容更新也要用户确认或满足组织选编策略。

活动 Run 使用旧 ResourceLock，绝不热改它的代码/技能。升级只影响新 Run。回滚切换 activeVersion，但不自动回滚成果、Connector 外部操作或不兼容数据库迁移。包自身可写状态放到独立 namespace，并在版本迁移前备份。

卸载先停用、确认受影响预设/计划任务，待运行引用释放再垃圾回收文件。历史来源可以保留版本摘要和必要审计；用户“彻底删除”时连同私有内容快照与引用一起清理，不能无限保留所有历史。

## 9. 审核与供应链

审核包含发布者身份、许可证和 NOTICE、依赖锁、平台矩阵、脚本与外联、提示注入样例、工具调用限制、输出可验证性。审核结果记录测试过的 Host/Pi 版本，不以 npm peerDependencies 的宽范围作为兼容证明。

撤销策略：阻止新 Run；对已运行危险包提示并允许立即停止，严重事件由组织策略强制停止；保留事件但清理敏感内容。离线设备只能依据本地缓存知道撤销情况，UI 必须展示最近检查时间。

P1 不做支付、评分交易、自动接受任意投稿与无审查远程代码更新。商业市场是供应链运营系统，不是几张卡片和一个安装按钮。

## 10. 必须验收的安装故障

断网、磁盘满、摘要错误、签名过期、目录穿越、同名包冲突、依赖环、版本不兼容、安装中退出、更新新增权限、撤销包、卸载有活动引用、Windows 被占用文件、恶意 npm lifecycle 脚本。对每项验证：旧版可继续、新版不半激活、错误可定位、无意外代码执行。
