# A0/A1 发行包缺口与采用边界

选择输入：Node 24.21.0 LTS、npm 11.19.0、Pi 0.87.0、TypeScript 7.0.2；精确依赖见根 package.json，唯一项目锁文件为 package-lock.json。探针只导入两个 Pi 包的公开根入口。被测提交、下载摘要及运行结果见本目录的后续验证报告；不把源码候选 0.86.1 当作发行锁。

## G01：严格 NodeNext 声明检查失败（阻塞）

复现：完成显式应用初始化后运行 `npm run typecheck`。当前 tsconfig 保留 strict、NodeNext 和完整声明检查，没有 skipLibCheck、any 兼容层、ts-ignore 或 paths 重定向。

- 发行包嵌套的 `@earendil-works/pi-ai/dist/providers/*.models.d.ts` 包含普通 JSON import，缺少 `with { type: "json" }` 或 type-only 标记。TypeScript 报 TS1543；实测 41 个此类诊断。
- 锁定的 `@google/genai@2.21.0` 声明引用未安装的 `@modelcontextprotocol/sdk/client/index.js`，报 TS2307。该可选类型引用也不能凭 SDK 运行成功视为通过。
- 当前 adapter 与测试文件没有独立编译诊断，但**整个 npm run typecheck 失败**。实际 ESM import 与零模型 SDK 探针的通过不替代类型检查。

候选：优先等待/采用修复声明的官方发行包，重新锁定并运行同一组验证；上游可修正生成的 JSON 类型导入，并解决可选 MCP 类型依赖的声明发布方式。单独补装 MCP 只能涉及后一项，不能解决前一项，本轮不为此扩展依赖面。根入口没有可替代的稳定 `./sdk` 子路径；不通过内部路径规避。

没有修改 node_modules、添加声明补丁、Fork 上游或切换成不反映 Node ESM 的解析模式。将来若批准最小补丁，应另写 ADR、固定补丁、回归这两个诊断，并在官方版本修复后退出补丁。本轮不构成此类批准。

## G02：新会话首次持久化有原生门槛（已验证边界）

`SessionManager.create` 后仅调用 `sendCustomMessage(..., { triggerTurn: false })` 不立即产生磁盘文件。Pi 首次看到 assistant 记录后才写出已有历史。公开声明没有 SessionManager.flush/close；AgentSession.dispose 也不是强制落盘方法。

测试通过公开 appendMessage 写入带有 SYNTHETIC 文本、synthetic-a1 provider/model、零 usage 的合成 assistant 记录后，验证保存、释放、open、entries 与上下文一致。合成数据只用于测试；产品不得插入虚假模型回复强行落盘。若以后需要持久化尚未有模型回复的原生会话，先向上游确认公开持久化入口或最小补丁方案；不能自己重写 JSONL。

## G03：释放与替换失败不是自动事务（已验证边界）
Runtime 在 teardown 后 factory 失败时仍可返回旧的 disposed session 对象；dispose 不保证每一个公开方法都抛错。探针用公开 setBeforeSessionInvalidate/setRebindSession 管理宿主绑定：撤销身份、退订，失败后保持 session_unavailable，通过已保存的原生引用创建新 Runtime 恢复，不继续派发给旧对象。

重新绑定失败会清理刚注册的回调和不完整新实例。回调捕获不可复用的绑定 UUID 和原生 Session ID，不能在交付时取“当前会话”补身份。本轮覆盖 Session 替换；产品 Run 身份、迟到操作审计、产品队列及快照交接尚未实现。

## 未测试的能力

未调用任何 Provider，包括本地、免费或订阅模型；未测试运行中的取消、模型流、压缩、基础工具执行、完整技能/包策略、系统凭据存储、Electron/Worker 打包 ABI、Windows/Linux 实机、UI、发布或产品沙箱。Node Permission 与网络 tripwire 是探针防误调用边界；macOS 另加系统网络 deny 规则，不代表产品沙箱交付。
