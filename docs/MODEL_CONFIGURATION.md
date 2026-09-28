# 模型配置入口

M1 提供独立配置文件和桌面中的本机凭据选择入口。它遵循“设置与凭据分离、通过 Pi SDK 接入”的方式；没有一个适用于所有社区项目的统一配置格式。Pi 的 models.json 用于自定义 Provider/模型，Workbench 的 model.json 另承载本产品的发送授权和预算，不能互换，也不修改用户全局 Pi 配置。

当前接入范围：macOS arm64，Pi 0.87.0 目录中的 Anthropic Messages API。其他 API、代理、自定义 endpoint、OAuth 尚未开放；真实服务验收尚未进行。所有离线测试均无真实模型调用。

## 稍后填写

在已初始化的仓库中，使用项目指定 Node/npm：

```bash
npm run model:config -- init
```

创建 `~/Library/Application Support/Pi Workbench/model.json`，文件权限 0600。已存在时拒绝覆盖，可直接编辑原文件。文件只填非秘密值：

| 字段 | 含义 |
|---|---|
| provider / model | Pi 发行目录中的 Provider 和精确模型 ID；无默认真实模型 |
| endpoint | 与发行目录相同的官方 base URL；check 会核对 |
| approved | 初始 false；核对服务、数据、限额后再由你改为 true |
| dataScope | 本阶段固定 synthetic_non_sensitive，仅发送合成无敏感材料 |
| maxRequests | 此授权下累计最多请求数，含失败请求；禁自动重试 |
| maxOutputTokens / timeoutMs | 单次输出上限和执行期限 |
| maxEstimatedCostUsd | 累计预留费用估算上限，不是服务商实际账单保证 |
| authorizationId | 本次授权的唯一身份；重开不重置，不应为了绕过限额改动 |

检查不会调用模型、加载全局凭据或刷新远端目录：

```bash
npm run model:config -- check
npm run desktop:model
```

也可指定自己的非秘密配置路径：`npm run model:config -- check /absolute/path/model.json`，启动时使用 `npm run desktop:model -- --model-config=/absolute/path/model.json`。修改后重启应用读取。

check 显示当前配置的单次保守预留费用（整个模型上下文窗口和输出上限），可能远高于短文本实际费用；总预算不足一次预留时调用会在网络前被拒绝。价格来源是固定发行目录，首次真实验收还需核对服务商当期价格与账户硬预算。不要把预算字段当成自动提高限额的许可。

## 本机凭据

在仓库外准备只包含 API key 的 UTF-8 `.key` 文件，例如应用专用目录中的 `provider.key`；权限必须仅当前用户可读写（0600）。用本机编辑器填入，不放进聊天、Git、model.json、命令参数或环境变量。桌面配置区点击“选择凭据并启用本次应用”，在原生文件框中选择该文件。

页面仅收到就绪状态，不接收密钥或文件路径。应用不会把 key 写入产品数据库、原生 Session 或日志；内存凭据在宿主重连/退出后失效，原始 `.key` 文件由你管理。应用当前不提供系统 Keychain 或 OAuth。

`approved=false`、配置无效或未选择凭据时不能发送。启用后，按“新建会话 → 发送合成文本 → 同一会话继续 → 停止”验证。会话保留 Pi 原生上下文；每次发送是一次执行，当前没有文件或 Shell 工具。停止不承诺撤销服务商已经产生的费用。

## 离线检查

```bash
npm run test:model-integration-offline
npm run test:model-network
npm run test:model-config
npm run test:desktop-model
```

分别覆盖真实 Pi/IPC 的合成文本、固定本机 HTTP/OS 禁网、配置与原生凭据选择、真实 Electron 会话操作。配置 UI 测试使用合成 key 且强制宿主禁网；原生文件框通过参数替代测试，不冒充人工选文件验收。

完整准入/所有权和未覆盖范围见 [M1 契约](ssot/m1-model-contract.md)。填配置不等于本次 Codex 已获准执行真实调用；M1-B 仍需明确账户、允许数据、请求预算及费用授权后单独记录证据。
