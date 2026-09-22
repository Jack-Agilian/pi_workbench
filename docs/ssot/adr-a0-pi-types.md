# ADR-A0：Pi 0.87.0 的最小类型声明修复

日期：2026-09-22。范围：A0/A1 收尾。依据为用户本轮继续完成类型阻塞修复的指令；仅允许下述类型声明修正，不授权整仓 Fork、运行时代码修改或放宽检查。状态：决定采用，最终结果待本轮验证记录。

## 复现与来源

基线 `90bf84889b391eccc5f6eac88c7f881ea69e865c` 上，`npm run typecheck` 在 strict、NodeNext、完整声明检查下失败：41 条 TS1543 和 1 条 TS2307。前者来自 Pi 发行包的 `*.models.d.ts` 普通 JSON import；后者来自 Google SDK 类型引用缺失的可选 MCP peer。原始记录见 [G01](../validation/a0-a1-gaps.md)。

本轮下载并验证官方 TypeScript 5.9.3、6.0.3 归档，与现有 7.0.2 对照；相同项目与选项都报告同样的 42 条错误。Pi [v0.87.0 根 package.json](https://github.com/earendil-works/pi/blob/v0.87.0/package.json) 固定 TypeScript 5.9.3 / native-preview 7.0.0-dev.20260120.1，其 [tsconfig.base.json](https://github.com/earendil-works/pi/blob/v0.87.0/tsconfig.base.json) 使用 Node16 和 skipLibCheck。不能用“上游构建成功”证明消费者的严格 NodeNext 声明检查通过。

实际声明中的 JSON 值仅用于 `typeof values` 类型表达式，改成 `import type values` 保留同一 JSON 推导类型，不改变运行时 import。TypeScript 官方 [NodeNext 测试](https://github.com/microsoft/typescript/blob/v7.0.2/tests/baselines/reference/nodeModulesJson(module=nodenext).errors.txt) 明确区分普通 JSON import 和无需运行时属性的 type-only import。

## 候选及取舍

| 候选 | 决定与理由 |
|---|---|
| 升级已修复的官方 Pi 发行包 | 优先退出路径；本轮 registry 查询最高稳定版本仍为 0.87.0，尚无已核验替代版本 |
| 对齐 TypeScript 5.9.3 或 6.0.3 | 已实测同样失败，不通过降低编译器版本掩盖问题；保留 7.0.2 |
| 采用上游 Node16/skipLibCheck 配置 | 不采用；项目使用 Node ESM，继续严格 NodeNext 与完整声明检查 |
| 改用公开子入口 | 发行 exports 没有稳定 ./sdk 子入口，不能转为内部 deep-import |
| 使用类型 shim、any、ts-ignore | 不采用；它们会丢失真实接口约束 |
| 仅补装 MCP SDK | 正确解决 optional peer 缺失，但不解决 41 条 JSON 声明问题 |
| 原生 npm patch | 锁定 npm 11.19.0 没有该命令/实现；滚动文档里的新功能不能直接作为本项目能力 |
| patch-package 或另换包管理器 | 本轮只需精确文本补丁；复用已有 Git apply 即可，避免增加补丁工具依赖或第二套包管理器 |

## 决定与最小范围

1. 保持 Node 24.21.0、npm 11.19.0、Pi 0.87.0、TypeScript 7.0.2。
2. 精确增加已发布的 `@modelcontextprotocol/sdk@1.30.0` 开发依赖，满足 `@google/genai@2.21.0` 声明的 `^1.25.2` optional peer。仅用于类型解析，不创建 MCP 客户端/服务器，不调用任何 Provider。
3. 对 `@earendil-works/pi-ai@0.87.0` 的 41 个 `dist/providers/*.models.d.ts`，每文件只将第一条 `import values` 改为 `import type values`。锁定依赖图有顶层与 coding-agent 嵌套两个副本，必须同时处理。所有 .js、JSON 模型数据及 API 导出保持原发行字节。
4. 提交普通 unified diff、原始 SRI 与逐文件修改前后 SHA-256。使用 Git apply，不实现另一套 diff/patch 算法。对包版本、补丁摘要、文件集合及前后摘要做窄范围检查；未知变更、部分修改或版本漂移必须失败。
5. 初始化仍先 `npm ci --ignore-scripts`，再显式执行已审阅的本仓库类型补丁入口；不使用 postinstall，不开启第三方 lifecycle scripts。补丁入口可重复执行；typecheck 只验证补丁状态，不偷偷修改依赖。

Pi 自带 shrinkwrap 的嵌套 pi-ai 条目原本缺少 integrity，导致 npm 生成的根锁也遗漏该字段。本轮仅在根锁该条目补齐与顶层同版本、同 tarball URL 对应的已验证 SRI；不修改上游 shrinkwrap、不更改解析版本。补丁检查要求两个副本均有此 SRI，不能以字段缺失为由跳过。后续 npm install 若重新生成并丢失它，必须重新核验并补齐；npm ci 不改写该锁。

新增 MCP 开发依赖引入 92 个锁定依赖路径；保留 npm 的实际依赖图，不手写 MCP 类型或裁剪发行包。未执行其服务、客户端或安装脚本。

## 回归与完整性

- 保留最小公开 SDK 导入复现，验证修复前 42 个诊断及修复后的严格编译结果。
- 验证补丁重复应用、干净安装、未知文件漂移/版本不匹配/部分补丁的拒绝；故障前不写入文件。
- 原 registry tarball 的 SRI 不变。下载审计对修改的声明分别验证原始与安装后摘要，其余发行文件逐字节一致；完整性报告明确标记本地类型补丁，不能宣称整个安装目录未修改。
- 用错误的 SDK 入参做编译负向检查，证明真实参数类型仍然约束调用；不通过关闭声明检查获得绿色结果。
- 重跑现有 10 项零模型 Session 探针、隔离自检、文档/SSOT/工具检查及全新副本的重复初始化。

## 退出和上游计划

准备可直接给上游使用的最小复现及补丁说明，当前任务不自动向外发送 Issue/PR。正式向上游提交需遵守外部发送授权。

升级 Pi 时先在干净安装上复现：若官方声明已修正且 optional peer 的严格类型解析也可满足，删除补丁和对应应用入口，重新核验 tarball/lock、类型负向检查及 SDK 探针。版本变化时现有补丁必须拒绝自动套用，不能沿用未经验证的 41 文件范围。MCP peer 只有在实际依赖声明不再需要后才可移除。

本 ADR 不改变原生 Session 首次落盘门槛或替换失败语义，不涉及 A2、模型调用或产品运行时。
