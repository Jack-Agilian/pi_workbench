import type { Command, OperationView } from '../../packages/app-contracts/index.ts';

export function ApprovalList({pending, workspacePath, modelMode, busy, disconnected, command}: {pending: OperationView[]; workspacePath: string; modelMode: boolean; busy: boolean; disconnected: boolean; command: (value: Command) => Promise<unknown>}) {
  return <>{pending.map(op => <section className="approval" key={op.id} data-approval={op.id} tabIndex={-1} aria-label={op.shell ? '命令执行审批' : op.tool === 'read' ? '文件读取审批' : '文件写入审批'}>
    <header><span className="approval-label">需要确认</span><h3>{op.shell ? '执行 Bash 命令' : op.tool === 'read' ? '读取 Markdown' : op.tool === 'edit' ? '修改 Markdown' : op.file?.fileVersion ? '替换 Markdown' : '新建 Markdown'}</h3></header>
    <div className="approval-body">
      <p className="field-label">执行目标</p><pre className="target">{op.shell ? op.shell.intent.command : op.artifactPath}</pre>
      <details className="approval-context"><summary>目录：{workspacePath.split('/').at(-1)}</summary><p className="approval-workspace">{workspacePath}</p></details>
      <p className="approval-risk">{op.shell ? '命令可能改动整个工作目录，停止不会回滚。' : op.tool === 'read' ? '读取目标文件的内容。' : '会改动目标文件，停止不会回滚。'}{modelMode && '工具结果将发送给本次模型。'}</p>
      {op.file && <details className="file-change"><summary>{op.file.summary} · 版本 {op.file.fileVersion?.slice(0,12) ?? '尚不存在'}</summary><pre>{op.file.preview}</pre><small>安全摘要；超长内容截断。</small></details>}
      <details className="approval-meta"><summary>权限与校验信息</summary>
        <dl><dt>工具</dt><dd>Pi {op.tool}</dd><dt>有效范围</dt><dd>仅此任务 · 一次执行</dd><dt>数据去向</dt><dd>{modelMode ? '批准工作区；工具结果将发送给本次模型' : '当前批准工作区'}</dd>
          {op.shell && <><dt>执行配置</dt><dd>{op.shell.intent.profile} · 禁网、隔离环境</dd><dt>超时</dt><dd>{op.shell.intent.timeoutMs === null ? '无命令独立超时' : `${op.shell.intent.timeoutMs / 1000} 秒`}</dd></>}
        </dl>
        <p className="field-label">参数摘要</p><code>{op.parametersDigest}</code>
        <p>{op.shell ? '许可绑定当前任务、命令、目录、执行配置和期限。' : '许可绑定当前任务与文件版本；目标变化后失效。'}</p>
      </details>
    </div>
    <footer><p className="approval-deadline">批准截止 {new Date(op.deadline).toLocaleTimeString('zh-CN')}</p><div className="approval-actions">
      <button disabled={busy || disconnected} onClick={() => void command({type:'approvals.resolve', requestId:crypto.randomUUID(), operationId:op.id, parametersDigest:op.parametersDigest, decision:'deny'})}>拒绝</button>
      <button className="primary" disabled={busy || disconnected} onClick={() => void command({type:'approvals.resolve', requestId:crypto.randomUUID(), operationId:op.id, parametersDigest:op.parametersDigest, decision:'allow'})}>仅本次允许</button>
    </div></footer>
  </section>)}</>;
}
