# 模型配置入口

工作台使用两个文件：`model.json` 保存模型、接口与本次发送授权；`auth.json` 保存 API key。默认目录是 `~/Library/Application Support/Pi Workbench/`，不读取或修改全局 `~/.pi/agent`。

Pi 本身也将 key 保存在 `~/.pi/agent/auth.json`，文件初建权限为 0600（仅本人读写）；自定义模型配置放在 `models.json`。见 [Pi 官方凭据说明](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/providers.md)。本仓库核对的是安装的 Pi 0.87.0 文档与公开 SDK。工作台采用其 `api_key` 凭据记录格式，但 `model.json` 是产品授权格式，不能直接当 Pi 的 `models.json` 使用。

当前支持官方 OpenAI Responses、经用户批准的 OpenAI 兼容 Responses/Chat Completions，以及原有 Anthropic Messages。均已做真实 Pi/Worker 的合成响应测试，尚未做真实服务验收。限定 macOS arm64；没有新增 SDK 或重写 Provider。

## 初始化与填写

使用项目指定 Node/npm。官方 OpenAI：

```bash
npm run model:config -- init-openai
npm run model:config -- init-auth
```

若使用第三方 OpenAI 兼容服务，第一条换成 `npm run model:config -- init-compatible`。所有 init 命令均拒绝覆盖已有文件；已有文件直接编辑。`init` 仍可创建通用占位模板。也可在命令最后指定仓库外目标路径。

`auth.json` 内容如下，在本机编辑器中填入实际 key：

```json
{
  "openai": { "type": "api_key", "key": "" }
}
```

key 是明文保存，权限必须为 0600；不要放入聊天、Git、`model.json` 或命令参数。这里只接受字面量 key，不运行 Pi 可支持的 `!命令`，不解析环境变量，也不接受 OAuth 记录。启动和宿主重连时，批准的配置会读取其同目录 `auth.json`；修改后重启。缺失、空 key 或权限不合格时保持“需要凭据”。

`model.json` 由初始化命令生成，填写以下内容：

| 字段 | 含义 |
|---|---|
| provider / model | OpenAI 接口填 openai，model 填服务商的精确模型 ID；没有默认真实模型 |
| endpoint | Base URL，包含服务商要求的路径，例如官方 https://api.openai.com/v1；不追加 /responses 或 /chat/completions |
| approved | 初始 false；核对服务、数据、限额后再由你改为 true |
| dataScope | 本阶段固定 synthetic_non_sensitive，仅发送合成无敏感材料 |
| maxRequests | 此授权累计最多请求数，含失败请求；禁自动重试 |
| maxOutputTokens / timeoutMs | 单次输出上限和期限；Responses 至少 16 tokens |
| maxEstimatedCostUsd | 累计保守预留估算上限，不是服务商账单保证 |
| authorizationId | 本次授权身份；重开不重置，不应为了绕过限额修改 |
| openai | 可选兼容接口声明，见下方；官方发行目录模型一般不需要 |

官方模式不填 `openai`，模型与 endpoint 必须匹配固定 Pi 发行目录。其他 endpoint/自定义模型必须显式填写 `openai`，例如：

```json
"openai": {
  "api": "chat-completions",
  "contextWindow": 8192,
  "inputUsdPerMillion": 0.2,
  "outputUsdPerMillion": 0.4,
  "tokenLimitField": "max_tokens"
}
```

上述数字仅演示字段，不是任一服务商的真实价格。初始化兼容模板的数值为 0，必须按服务商资料填写才能通过检查；价格要求正数，可填写保守上界。新式 Chat Completions 服务可能要求 `max_completion_tokens`；Responses 使用 `api: "responses"` 并删除 `tokenLimitField`。不自动尝试其他接口或切换模型。仅文本、零工具，不开放自定义请求头、任意参数或可执行代码。

```bash
npm run model:config -- check
npm run desktop:model
```

check 不发模型请求，不读取 key 或远端目录；显示单次保守预留与预算内最多可请求数。估算采用整个上下文窗口与输出上限；官方模式使用 Pi 固定目录价格，兼容模式使用用户填写的元数据，可能远高于短文本实际费用。首次真实验收仍需核对服务商当期价格和账户硬限额。

自定义路径：`npm run model:config -- check /absolute/path/model.json`；启动使用 `npm run desktop:model -- --model-config=/absolute/path/model.json`，凭据仍取同目录 `auth.json`。

## 桌面与凭据边界

Renderer 只收到就绪状态，不接收 key、路径或 Pi 对象。宿主通过已有私有通道将内存 key 交给 Pi 公开 `ModelRuntime.setRuntimeApiKey`；不会把 key 写进产品库、原生 Session 或日志。不声称内存物理擦除、Keychain 或 OAuth 已实现。

原有“选择凭据”仍可临时加载仓库外、权限 0600 的纯文本 `.key` 文件。此操作不修改 `auth.json`；重连后会重新读持久配置，临时 key 不保留。文件路径不能由页面指定。

`approved=false`、配置无效或无有效凭据时不能发送。启用后按“新建会话 → 发送合成文本 → 同一会话继续 → 停止”验证；原生上下文由 Pi 保存，每次发送一次执行，没有文件或 Shell 工具。停止不承诺撤销服务商费用。

## 离线检查

```bash
npm run test:model-integration-offline
npm run test:model-network
npm run test:model-config
npm run test:desktop-model
npm run test:desktop
```

覆盖真实 SDK/进程的合成 SSE、固定本机 HTTP/OS 禁网、配置和持久凭据、真实 Electron 会话操作。凭据测试使用合成 key、临时目录和宿主禁网；程序化原生 dialog 测试不冒充人工验收。

完整边界见 [M1 契约](ssot/m1-model-contract.md)。填配置不等于 Codex 已获准执行真实调用；M1-B 仍需明确账户、数据、请求预算及费用授权后单独记录证据。
