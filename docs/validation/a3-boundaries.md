# A3 已验证的边界与未完成项

对象为 Pi 0.87.0 发行包，实际被测代码与命令见 [A3 报告](a3-2026-09-22.md)，字节来源见 [输入摘要](a3-inputs.json)。本轮使用公开入口，没有运行时代码补丁、deep import 或 Fork。

## G-A3-01：默认加载器不能配置缺包处理

`DefaultPackageManager.resolve(onMissing)` 可以指定 skip/error；但 `DefaultResourceLoader.reload()` 内部调用无参数的 resolve，而且 `noExtensions/noSkills` 在包解析之后才生效。公开 options 没有 PackageManager 注入或 onMissing 策略。`resolveExtensionSources()` 同样没有 onMissing 回调，不能把任意 additionalExtensionPaths 当作纯本地资源清单。

可复现：`npm run prepare:pi-packages` 后，运行 `npm run test:pi-packages`。其中 public gap 用例在空临时项目配置 `npm:is-number@7.0.0`，设置全部 no* 标志，关闭 Pi 的 offline 快捷返回但保留 npm --offline、JS 网络 tripwire 与 OS 禁网；reload 确实从已审核缓存安装了包。外部 facade 的进度回调不会收到加载器内部 manager 的安装事件。该测试验证缺口，不能作为运行时允许自动安装的证据。

本轮采用：运行时使用显式 ResourceLoader，复用 Pi loadSkills 和公共 PackageManager 的显式 skip/error 解析；不向默认加载器传未安装来源。DefaultResourceLoader 仅在独立合成测试中验证全空发现策略和预筛选 inline factory。候选上游改进是注入缺包策略或 PackageManager；目前无需 Fork，也未向外发送 Issue。

## G-A3-02：解析也有目录发现及兼容来源访问

公开 PackageManager.resolve 仍会发现 `.pi`、全局和祖先 `.agents` 资源；没有纯 manifest-only 选项。在无 `.git` 边界的独立目录，实际越过临时根尝试读取祖先 `.git`，被 Node 权限拒绝。资源测试显式使用合成 `.git` 目录标记限定发现范围；不是一次真实 git init 或通用项目发现功能。

资源适配仅接收来自批准包根的 enabled skill 路径，在任何扩展加载之前过滤；从不把发现的扩展路径交给 factory/import。全局、项目和包内扩展陷阱均未执行。真正运行时应提供专用资源目录，不能把此测试结构直接推广到任意用户 cwd。用户范围 npm 还有 legacy global npm root 回退，本轮安装采用隔离的 project 范围，不把用户全局包作为受管来源。

候选是公开可注入的发现策略或只解析明确包的入口；当前隔离目录和显式资源接口已足够完成探针，不实现第二套来源解析器。

## G-A3-03：安装与产品激活分开

实际验证：固定 npm 的 update 跳过；Git update 会将已有 clone 原地重置到配置 ref；同包不同 npm 版本在同一根共享安装路径；local install 仅引用原目录，不复制。新版本必须在新临时根显式 install，验证后再由产品选择不可变快照。测试中 Git 原地切换仅发生于明确不活动的测试目录。

测试含真实离线 npm 6.0.0 → 7.0.0 双根、is-odd 的共享/嵌套依赖、只配置未安装、skip/error、缓存缺失、无效 Git ref 清理和失败后旧目录保持。Git fixture 是本轮合成的两个提交/tag，通过仅限该 URL 的临时 Git 配置重写到 file transport；不依赖真实远端认证，也不代表 HTTPS/SSH 拉取实测。

源码与实测表明安装器调用 npm；禁用 scripts 由显式 npmCommand CLI 参数承担。本轮 Git fixture 的四类 lifecycle canary 从未执行，包内 `.npmrc` 的 ignore-scripts=false 不能覆盖 CLI；没有把未审核脚本执行作为安装错误的修复。配置 npmCommand 后，上游 Git 默认 omit=dev 分支不再适用；本轮合成包仅有一项固定 runtime dependency，未验证通用 dev/peer/bin/native addon 安装政策。

PackageManager 进度是命令级事件，不能替代每项文件/进程副作用审计。测试同时用受管根、实际文件/版本/lock SRI、失败后残留及 OS 拒绝来限制结论。宿主数据库激活事务、签名/撤销、更新权限差异、活动引用 GC、外部 CLI 导入/冲突对账均未实现。设置列表改变仅证明 Pi 投影变化，不自动成为产品激活或删除。

## G-A3-04：快照与准入是受信任代码探针

完整复制批准目录，记录 SHA-256，拒绝 symlink/特殊文件和声明的包外依赖；模板与脚本作为数据一并复制，未执行。普通 Pi package.json.pi 与 SKILL.md 的资源解析、诊断、提示格式继续由 Pi 完成。批准方显式提供预期技能名，缺失或解析诊断导致失败。

只读权限防止普通误写，owner 仍可 chmod；requireReady 再核验内容可发现所测篡改。它不提供对恶意并发写入者的 OS 原子快照，不能静态证明任意 Markdown/脚本没有包外依赖，也不授权执行那些脚本。

相邻 A/B 仅是无模型准入场景：Pi 实例实际 reload，检查实际 loaded 锁、system prompt 和持久化回调后才允许 requireReady。活动 A 保留旧目录；禁用不会删除 Pi transcript。hostSettled、持久化故障和重入为明确合成输入，没有真正产品 Run/审批队列或数据库事务；没有调用模型验证技能使用。

## G-A3-05：测试用 macOS 子进程边界

SDK 主进程继续用 Node 窄读写权限。npm 的祖先 lstat 与 Node 子树权限不兼容，因此仅受信任 npm CLI 增加 `--allow-fs-read=*`；它仍继承 Node 临时目录写入、addon/worker 限制，并受 macOS profile 的文件内容白名单和禁网约束。边界自检用同样参数验证 `/etc/passwd` 与独立合成 canary 读取被 OS 拒绝、写入被 Node 拒绝、无 tripwire 的子 Node socket 被内核拒绝。

OS 允许祖先 metadata、项目/临时目录/所选 Node、系统运行库和 Homebrew 程序目录读取，只允许临时根与 `/dev/null` 写入。Git 关闭系统/用户真实配置，只用临时 URL 映射和 file protocol。整个测试从空环境构造，不继承 Provider、npm 凭据或用户 NODE_OPTIONS；不访问真实 auth.json 或密钥库。

这是固定可信 npm/Git 命令的 macOS 27.0 arm64 测试 profile，不是产品恶意扩展沙箱。Windows、Linux 子进程模式、网络安装超时/取消、任意包脚本/二进制和逃逸攻击均未验证。其他平台的 package 子进程模式明确失败，不开放回退。
