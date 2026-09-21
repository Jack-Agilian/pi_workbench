# 导入记录

导入整理日期：2026-09-21。

## 来源

用户重新上传 `Pi_Workbench_Startup_Pack_v0.1.zip`，压缩包 SHA-256：

```text
a94c5efd6c784fd325936213695fb00e61cc3a0580aaebb022be9b79ba952a81
```

原包根目录为 `pi_workbench_startup/`；去掉这一级容器后，28 个文件原样写入仓库 `docs/startup/`。其中一个文件是 MANIFEST，本次重新计算其余 27 个文件的 SHA-256，并与清单逐项比较。未修改原始 Word、Markdown、协议、示例和历史报告。

## 不是完整恢复

这次创建的是一个新本地 Git 仓库，没有恢复之前会话提到的 66 文件初始提交；不声称保留那个提交 SHA。另一套 Pi Desktop 资料未被合并，避免规格相互覆盖。

原文候选版本与测试成绩属于历史资料。本次示例测试在临时副本执行，新测试输出另写 `.artifacts/`。当前仓库中不存在真实 Pi/Electron 应用、模型请求记录、双平台安装包或安全沙箱实现。

## 新增文件

仓库根导航与工作约定、`docs/README.md`、开发说明、下一阶段计划、结构化 Backlog，以及初始化、检查、自检与 SSH 发布脚本。Backlog 由原始 28 项拆分为 JSON；负责人字段只表示角色，并未分配到真实人员或创建远端 Issues。

## 发布状态

此次 GitHub 连接器创建 README 的请求返回 `403 Resource not accessible by integration`。这代表该次请求未产生提交，不能据此宣称推送成功。当前容器也没有 OpenSSH 客户端，GitHub DNS 解析失败；本次未通过 deploy key 完成 SSH 身份或写权限验证。

密钥仍在仓库外，不进入源码包或 Git bundle。GitHub 网页可读取、账户元数据中出现 push 权限，都不能代替一次实际成功的写入和远端 SHA 核验。

## Git 作者

本地初始提交使用明确的工具生成作者标识 `Repository Setup Assistant <repository-setup@pi-workbench.invalid>`，不冒充用户，不修改全局 Git 身份。`.invalid` 地址不用于收取邮件，也不是 GitHub 身份认证或签名。
