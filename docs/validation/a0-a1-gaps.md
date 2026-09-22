# A0/A1 发行包缺口与采用边界

选择输入：Node 24.21.0 LTS、npm 11.19.0、Pi 0.87.0、TypeScript 7.0.2；精确依赖见根 package.json，唯一项目锁文件为 package-lock.json。探针只导入两个 Pi 包的公开根入口。首次失败见 [历史验证](a0-a1-2026-09-22.md)，当前结果见 [收尾验证](a0-a1-closeout-2026-09-22.md)；不把源码候选 0.86.1 当作发行锁。

## G01：原始发行声明失败（项目阻塞已解除，上游缺陷仍在）

原始复现：在 `90bf84889b391eccc5f6eac88c7f881ea69e865c` 完成应用初始化后运行 `npm run typecheck`。当前 tsconfig 仍保留 strict、NodeNext 和完整声明检查，没有 skipLibCheck、any 兼容层、ts-ignore 或 paths 重定向。

- 发行包嵌套的 `@earendil-works/pi-ai/dist/providers/*.models.d.ts` 包含普通 JSON import，缺少 `with { type: "json" }` 或 type-only 标记。TypeScript 报 TS1543；实测 41 个此类诊断。
- 锁定的 `@google/genai@2.21.0` 声明引用未安装的 `@modelcontextprotocol/sdk/client/index.js`，报 TS2307。该可选类型引用也不能凭 SDK 运行成功视为通过。
- 当时 adapter 与测试文件没有独立编译诊断，但**整个 npm run typecheck 失败**。实际 ESM import 与零模型 SDK 探针的通过不替代类型检查。

用户继续指令下按 [ADR-A0](../ssot/adr-a0-pi-types.md) 采用最小声明补丁，并精确补齐 MCP SDK 1.30.0 开发依赖。补丁只将两个 pi-ai 副本各 41 个 JSON 声明导入改成 type-only；运行时字节保持原发行。`npm ci --ignore-scripts` 后由显式入口校验摘要并使用 Git apply；无生命周期钩子。真实被测提交 `ad6a71b6faefdeece0ef5699fbc21eafdaf6c8fe` 上严格类型检查、10 项类型/补丁测试和 10 项 Session 探针均通过。

TypeScript 5.9.3/6.0.3/7.0.2 对照均复现原始 42 条诊断，降版本不能解决。单独补装 MCP 只消除 TS2307。根入口没有稳定 `./sdk` 子路径，未通过内部路径规避。未来优先采用修复的官方发行包并删除本地补丁；版本改变时当前补丁必须失败，重新审计后才能升级。不 Fork 上游、不放宽声明检查。

## G02：新会话首次持久化有原生门槛（已验证边界）

`SessionManager.create` 后仅调用 `sendCustomMessage(..., { triggerTurn: false })` 不立即产生磁盘文件。Pi 首次看到 assistant 记录后才写出已有历史。公开声明没有 SessionManager.flush/close；AgentSession.dispose 也不是强制落盘方法。

测试通过公开 appendMessage 写入带有 SYNTHETIC 文本、synthetic-a1 provider/model、零 usage 的合成 assistant 记录后，验证保存、释放、open、entries 与上下文一致。合成数据只用于测试；产品不得插入虚假模型回复强行落盘。若以后需要持久化尚未有模型回复的原生会话，先向上游确认公开持久化入口或最小补丁方案；不能自己重写 JSONL。

## G03：释放与替换失败不是自动事务（已验证边界）
Runtime 在 teardown 后 factory 失败时仍可返回旧的 disposed session 对象；dispose 不保证每一个公开方法都抛错。探针用公开 setBeforeSessionInvalidate/setRebindSession 管理宿主绑定：撤销身份、退订，失败后保持 session_unavailable，通过已保存的原生引用创建新 Runtime 恢复，不继续派发给旧对象。

重新绑定失败会清理刚注册的回调和不完整新实例。回调捕获不可复用的绑定 UUID 和原生 Session ID，不能在交付时取“当前会话”补身份。本轮覆盖 Session 替换；产品 Run 身份、迟到操作审计、产品队列及快照交接尚未实现。

## 未测试的能力

未调用任何 Provider，包括本地、免费或订阅模型；未测试运行中的取消、模型流、压缩、基础工具执行、完整技能/包策略、系统凭据存储、Electron/Worker 打包 ABI、Windows/Linux 实机、UI、发布或产品沙箱。Node Permission 与网络 tripwire 是探针防误调用边界；macOS 另加系统网络 deny 规则，不代表产品沙箱交付。
