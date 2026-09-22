# A4 公开入口与未验证边界

输入：Pi 0.87.0 / Node 24.21.0，代码 `ad6a3119d4f3d6c424799ae9de3a3901abdcd32b`。可复现命令：`npm run test:pi-auth`；测试均使用受控合成 Provider 和内存凭据，不使用真实账户。[完整报告](a4-2026-09-22.md) 与 [包摘要](a4-inputs.json) 定义实际范围。

## 1. SDK 对象与异常不是可直接发送的状态 DTO

`refresh failure …` 用合成敏感 cause 触发真正的 Pi `getAuth` 失败，实际 `Error.message` 含 cause 文本。四项 `post-commit …` 用公开 Provider.refreshModels 故障触发真正的 CredentialSynchronizationError；login/setRuntimeApiKey 的异常携带 credential，cause 也可能含敏感值。`checkAuth.source` 和 Provider/Model 的名字、headers、URL 同样不构成可信脱敏边界。

本轮只采用宿主固定清单的账户/模型展示字段，输出有限状态与固定结果码；不打印、序列化或透传这些对象。真实 Renderer/IPC、交互 prompt/notify、日志/崩溃报告仍需后续端到端验证。候选方案是集中在产品进程边界采用同一白名单契约，并单独审核登录 URL/device code 交互；不能把这份测试投影冒充完整认证 UI。

## 2. 变更失败不等于没有写入

同步错误是已提交的明确证据，必须先阻断依赖新状态的操作，再用公开 refresh 恢复一致性；不能盲目重复登录、写 key 或注销。测试验证四类变更已生效且没有重试。其他错误保守保留 unknown：合成 CredentialStore 在写入前后抛相同错误，实际持久状态不同。

产品恢复需重新读取权威存储并对账；本轮没有实现产品状态机/数据库事务。CredentialSynchronizationError 的存在不允许直接展示其 credential/cause，也不保证所有 store 失败都能判定为未提交。

## 3. 取消、并发与配置状态的含义有限

8 个同时 getAuth 在 Pi 内存 store 的同 provider 锁下只旋转一次；login/logout 与活跃刷新竞争最终不恢复旧记录。合成刷新故意忽略信号直到测试放行，证明调用方取消返回后底层操作仍可能活跃，store 锁继续持有直到结束。未据此声称真实 OAuth 网络取消、OS 密钥库跨进程锁或超时回收通过。

checkAuth 与 getAvailable 可把过期 OAuth 标为 configured，且不刷新；这是配置状态，不是服务端有效性。显示状态不能被当作请求成功保证。

## 4. 生命周期与系统存储仍有明确空白

所选公开 CredentialStore 只有 read/list/modify/delete；ModelRuntime 没有 flush/dispose/close。测试只记录这个入口事实，不能伪造一个 Pi.flush 或把 no-op 当退出持久化通过。候选是在以后真正选择 Keychain/DPAPI 存储时，给宿主拥有的持久适配器明确的 flush/close 与错误通道，并测试正在进行的修改/刷新、退出和崩溃；不要求 Fork Pi。

本轮未实现或访问系统密钥库，内存 store 只证明 SDK 接口和单进程串行化。默认文件 AuthStorage、磁盘凭据、真实 auth.json、系统账户均未使用。Worker 为发请求可能接触凭据，不能宣称其永远看不到密钥。

## 5. 离线与受控资源必须从创建前建立

`credentials`、`modelsStore` 显式注入，`modelsPath:null`，初始化关闭刷新，每次目录刷新显式 `allowNetwork:false`；这些配置不代替进程网络隔离。ModelRuntime 仍有内置 Provider；只使用合成 Provider 的 getAuth/login，内置入口仅做空凭据配置状态和静态目录查询。SDK 进程从空白名单环境启动，禁止真实用户配置读取、子进程和 native addon。

测试启动器的 canary 仅检测测试结果是否意外打印已知合成值，不是任意未知 secret 的识别器；Node 权限与 macOS profile 用于这些已知代码测试，不构成恶意扩展的完整产品沙箱。实际 Shell 环境隔离复用 A2 的真实 Bash 探针，在本轮增加父环境正向 canary。

公开目录刷新由 Pi 负责：旧刷新被替换后旧 publish 在此版本抛 AbortError，测试验证其不能覆盖新模型/缓存。这里没有远端目录网络、真实 token 刷新、付费/免费/本地模型推理或模型运行事件 fixture；Windows/Linux 也没有被实测。
