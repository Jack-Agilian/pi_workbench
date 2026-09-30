# UI-P2 前端限定增量（2026-09-30）

基线 `58d3130d9ed480e283434c749e285efd6ba2092d`；前端实现 `3c02b996c66576e8618c85048dd7488c2c6488a5`，截图驱动修正 `9b890840e6e9a5f76b8f7a9eed3c3038f63e0a9c`。本次使用用户指定的当前会话工作树，分支 `codex/ui-history-artifacts`，没有操作准备好的另一条前端分支或合并develop。

## 采用与范围

复用现有React 19.3.0、Electron 44.4.5、产品DesktopApi及Pi宿主链路；新增三个展示组件与Renderer滚动位置hook。未新增依赖/模型接口/持久状态机。React useLayoutEffect/useRef用于布局测量和会话浏览位置；Electron capturePage官方可选stayAwake用于测试截图，均已通过现有精确发行包类型检查。官方资料：React [useLayoutEffect](https://react.dev/reference/react/useLayoutEffect)、Electron [capturePage](https://www.electronjs.org/docs/latest/api/web-contents#contentscapturepagerect-opts)。文档查询不替代实际运行证据。

已交付：可收起/三档宽度右栏；收起时审批计数、入口及当前执行停止可用；新审批不抢焦点；旧记录锚点/每Thread浏览位置、草稿与返回最新；成果名称/路径/来源/版本及按需核验状态。核验标签明确为上次结果；无新核验时不声称当前文件ready，错误和迟到回复不展示其他会话的正文。

[详细交接与分页接入边界](../planning/UI_P2_FRONTEND_HANDOFF.md)。现有thread仍全量传输，R03超限尚未解决；没有另造分页DTO，也未改宿主/共享契约。R01/R02、开发profile、分页和组合验收归后端/集成增量。UI-01/02、ART-01保持in_progress，既有Gate不扩大。

## 本轮实际检查

平台macOS 27.0 arm64；固定Node 24.21.0/npm 11.19.0；真实模型调用0。完整命令/时刻/日志摘要和交互度量见 [输入摘要](ui-p2-frontend-2026-09-30/inputs.json)。原始输出在忽略目录 `.artifacts/ui-p2-frontend/` 与 `.artifacts/ui-layout/`，本页和输入摘要为持久证据。

| 命令 | 实际被测SHA | 结果/范围 |
|---|---|---|
| `npm run typecheck` | 3c02b99、9b89084 | passed；严格声明补丁保持 |
| `npm run test:desktop` | 3c02b99 | 20 passed；未因截图测试修改重复跑 |
| `npm run test:desktop-ui` | 3c02b99 | 两次退出1，截图UnknownVizError，见下方 |
| `npm run test:desktop-ui` | 9b89084 | passed；原allow/deny/cancel/crash、确认丢失/跨Thread重试、关闭失败回归保留，新增UI-P2检查通过 |
| `npm run test:desktop-agent-shell` | 9b89084 | passed；真实Pi/Bash、原生目录入口、逐审批、非零退出、重连不重放，合成Provider |
| `npm run test:desktop-file-agent` | 9b89084 | passed；实际文件/宿主和合成模型 |
| `npm run test:desktop-model` | 9b89084 | passed；合成流、原生上下文恢复、取消 |

新增UI-P2测试使用36条**合成展示Run**和受控preview响应，经实际Electron Renderer验证三个窗口尺寸/三档栏宽、收起时新审批通知和停止可达、焦点/选择范围、草稿/滚动恢复、前部内容增长保持锚点、返回最新、四种核验状态及迟到预览隔离；展示交互发出的执行命令数为0。这不是36条真实模型/数据库历史记录，也不是后端分页测试。既有套件另覆盖真实宿主的成果ready/changed和审批/取消。

## 本轮失败与修正

在实现SHA上收尾检查连续两次遇到Electron `UnknownVizError`，位于新增三尺寸截图阶段；前一轮未提交实现曾通过，不据此覆盖失败。未观察到业务断言失败，底层错误根因未完全定位。截图驱动追加resize后双requestAnimationFrame等待、capturePage stayAwake、非空断言和尺寸/可见性诊断；未跳过截图、重试吞错或降低断言。修正SHA上截图和整套交互随后通过。此结果不保证所有屏幕/锁屏条件稳定。

## 实际截图

[1320×860](ui-p2-frontend-2026-09-30/ui-p2-approval-1320x860.png) · [1024×720](ui-p2-frontend-2026-09-30/ui-p2-approval-1024x720.png) · [820×640](ui-p2-frontend-2026-09-30/ui-p2-approval-820x640.png) 是合成长历史展示；[820×640真实Pi/Bash审批](ui-p2-frontend-2026-09-30/agent-shell-approval-820x640.png) 使用合成Provider。PNG为Retina像素，文件名为CSS窗口尺寸。

未测：真实模型桌面人工体验、原生中文输入法人工操作/读屏、后端超大历史传输、分页组合、跨进程浏览位置持久化、Windows、PTY和生产发行。没有访问真实配置/凭据或启动共享用户profile的普通模型模式。

## SSOT及文件检查

在9b89084加本次文档差异上执行 `.venv/bin/python scripts/check-ssot.py`（60 passed）、`scripts/test-tools.py`（15 passed）、`scripts/check-docs.py --structural-only`（5 passed / 2有意跳过）及 `scripts/check-docs.py --typecheck`（7 passed）。docs/startup的27份原摘要保持一致。采用入口追加React useLayoutEffect，前端任务只追加限定证据，保留in_progress。没有新增真实模型证据或晋级Gate。
