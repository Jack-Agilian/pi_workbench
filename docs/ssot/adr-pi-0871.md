# ADR：Pi 0.87.1 升级与既有类型补丁延续

日期：2026-09-29。用户要求评估较新 gpt-6-luna 的 Pi 支持；此前锁定 0.87.0 不含该模型，注册手工元数据虽可接入，但会重复维护上游已发布的能力。

## 决定与来源

采用 registry 已发布的两个直接依赖 @earendil-works/pi-ai 和 @earendil-works/pi-coding-agent 精确 0.87.1。官方 [v0.87.1 发行说明](https://github.com/earendil-works/pi/releases/tag/v0.87.1) 明确加入 OpenAI API key / Codex 下 GPT-6 Luna/Sol 支持。Node engines 仍 >=22.19.0，现有 24.21.0 LTS 满足；不升级 Node/npm/Electron/React，不修改用户 API 服务。

未知兼容模型继续使用原有公开 registerProvider 配置。对于已在 Pi 目录中的 OpenAI 模型，使用公开 registerProvider 仅覆盖用户批准的 baseUrl，保留原生模型能力/价格/上下文元数据。所有模型请求仍固定经过宿主 IPC HTTP、单 URL、零工具、请求/费用预留，不能凭新模型加入绕过授权。

## 类型补丁复核

官方 0.87.1 tarball 的 41 个 providers/*.models.d.ts 与旧补丁 manifest 的 beforeSha256 逐一相同；原始 JSON value import 问题仍在。因此沿用 [ADR-A0](adr-a0-pi-types.md) 的相同一行 import type 修复，新增独立的 0.87.1 manifest/SRI，保留 0.87.0 历史补丁及证据。候选升级已经核验，仍不能宣称上游已修正声明。

不改 JS、JSON 模型数据、导出或声明检查选项。npm 更新时五个嵌套 Pi 包缺失 lock integrity，补丁检查因此拒绝；按各精确版官方 registry 下载并计算实际 SRI 后补齐唯一锁文件，再通过两轮 npm ci 核验。未删除或放宽 integrity 断言。两份已安装 Pi AI 副本全部核对后才应用；未知字节/版本/SRI/部分补丁仍拒绝。退出路径保持为上游发行修正这些声明后移除补丁，而非 fork。必须验证实际 tarball/锁/安装字节、公开 import、重复初始化、类型与 A1–M1 回归后才登记升级完成。

## 限制

Pi 内置价格是上游参考，第三方网关可能有倍率/不同账单；不能把目录价说成用户网关的真实费率。真实请求和模型验收另记，不从升级或目录可见自动推导成功。新运行时的采用证据登记在 reuse-map，而历史报告保留当时版本。
