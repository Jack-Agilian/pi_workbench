# 接口与数据样例

这些文件定义本项目产品协议，不是 Pi / WorkBuddy 的 API，也不是应用实现。

`app-protocol.ts` 可以独立进行 TypeScript 类型检查；真实 IPC 仍需运行时 Schema 验证。`initial-schema.sql` 是可创建的 SQLite 模型草案，包含部分外键、唯一约束和检查，但没有权限执行器、完整迁移、调度器或恢复代码。`plugin-manifest.schema.json` 只验证结构；安全解包、签名、撤销、内容审查与 OS 隔离都必须另行实现。

配套示例资源锁故意标记未执行与未授权，不符合生产 `RunResourceLock` 所需的已锁定 runtime 字段；它是导入/评审前状态，不得用于真正启动 Run。
