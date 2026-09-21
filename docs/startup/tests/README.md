# 示例校验

执行 `python tests/validate.py`（需要 Python 的 jsonschema 包）。TypeScript 独立检查：

```bash
tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext contracts/app-protocol.ts
```

校验范围只有 Manifest 结构、示例路径与摘要、SQL 可创建和部分约束、引用完整性及类型。没有运行真实 Pi、模型、Electron、安装器、Connector 或 OS 沙箱。`validation-report.json` 不能当作生产安全报告。
