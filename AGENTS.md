# Repository working agreement

本仓库当前是文档与工程准备，不是已经实现的 App。默认技术方向来自用户已确认的 Pi 桌面工作台需求；不要宣称已经实现或实测。

## 修改与验证

- 先阅读 `docs/ssot/README.md`、`docs/README.md` 和 `docs/planning/NEXT_STEPS.md`。当前复用与接入决策以 `docs/ssot/` 为准。
- 新能力先查 `docs/ssot/reuse-map.json`；优先 Pi 公开导出、Operations 和经审核社区模块。默认不得重写 Agent Loop、原生 Session/Compaction、Provider/OAuth、技能解析及基础工具。公开 API 的缺陷或安全限制确需例外时，先以 ADR 记录复现、候选复用方案及拒绝原因、最小补丁范围、回归测试和退出/上游合并计划；例外不等于授权整仓 fork。
- Pi 类型允许存在于适配包内部；不得渗入 Renderer/产品持久协议。禁止未经评审 deep-import 上游内部源码。
- 同步更新文档和 `backlog.json`，运行 `python scripts/check-ssot.py`。任务/能力数量可增长，状态可推进；完成、发行版验证及 Issue 已核验声明须引用可定位证据，不把离线结构校验当作外部事实证明。
- `docs/startup/` 是原始资料快照，由原包 MANIFEST 校验。不要直接改写其中的文件或历史测试报告；新的规格/决策放到快照目录之外。确需改变快照策略，先记录来源和摘要迁移方案。
- 结构检查：`python scripts/check-docs.py --structural-only`。
- 完整示例检查：`python scripts/check-docs.py --typecheck`；需要 jsonschema 和已安装的 tsc。
- 仓库脚本测试：`python scripts/test-tools.py`。
- 新报告写入被忽略的 `.artifacts/`，不要把旧报告当作本次运行结果。
- 不从仓库、用户全局目录或任意 npm 包自动加载未经批准的 Pi 扩展。

## 后续代码实现边界

UI 只认识产品协议；App Server 管产品状态；Pi Worker 不直接写产品 SQLite。平台执行、进程树、审批和凭据必须走明确边界。声明权限不等于实现沙箱。

引入 Pi、Electron 等依赖前核验官方发布版本，精确固定并提交锁文件。不要把原文中的候选版本当成当前最新版本。不得伪造运行事件 fixture；Mock 和真实 Pi fixture 必须分开。

## 安全与发布

密钥始终位于仓库外；禁止打印秘密。不要强制推送、重写已有远端历史或更改账户/分支保护。发布只有在远端 SHA 被独立读回确认后才算成功。

对模型计费、外部发送、发布安装包、修改账户权限、删除数据等外部副作用，需要相应授权。不能将 Linux 测试结果描述为 macOS/Windows 实测，也不能把静态类型通过描述为端到端通过。
