import type { OperationPage } from '../../packages/app-contracts/desktop-pages.ts';
import type { Command, RunState } from '../../packages/app-contracts/index.ts';
import type { DesktopHome, DesktopThread } from '../../packages/app-contracts/desktop.ts';
const labels: Record<RunState, string> = { queued: '等待执行', starting: '正在启动', running: '执行中', cancelling: '正在停止 · 等待清理', unknown: '结果待核实', completed: '已完成', failed: '未完成', cancelled: '已取消' };
const operationLabels: Record<string, string> = { pending: '等待你的批准', approved: '已批准', executing: '操作执行中', unknown: '副作用待核实', succeeded: '结果已核实', failed: '操作失败', denied: '已拒绝或撤销' };
const shellLabels: Record<string,string> = { pending: '等待批准', approved: '已批准', executing: '命令执行中', unknown: '执行结果待核实', succeeded: '命令已结束', failed: '命令未成功', denied: '已拒绝或撤销' };
const active = new Set<RunState>(['queued','starting','running','cancelling','unknown']);

export function RunHistory({thread, mode, busy, disconnected, command, operationPages, loading, loadMore}: {operationPages?: ReadonlyMap<string, OperationPage>; loading: boolean; loadMore: (runId: string) => void; thread: DesktopThread; mode: DesktopHome['mode'] | undefined; busy: boolean; disconnected: boolean; command: (value: Command) => Promise<unknown>}) {
  const modelMode = mode === 'model' || mode === 'model-offline';
  const id = () => crypto.randomUUID();
  const runLabel=(run:NonNullable<typeof thread>['runs'][number])=>{
    if(run.state!=='running')return labels[run.state];
    const ops=thread.operations.filter(op=>op.runId===run.id)??[];
    if(ops.some(op=>op.state==='pending'))return '等待你的批准';
    if(ops.some(op=>op.state==='executing'||op.state==='approved'))return '正在执行工具';
    return modelMode?'等待模型回复':'执行中';
  };
  return <>
            {thread.runs.map((run) => <article className={modelMode?'run model-run':'run'} key={run.id} data-run={run.id} data-state={run.state}>
              <div className="run-label"><span>本次执行</span><span className={`state state-${run.state}`}>{runLabel(run)}</span>{active.has(run.state) && !['unknown','cancelling'].includes(run.state) && <button className="stop" disabled={busy || disconnected} onClick={() => void command({ type: 'runs.cancel', requestId: id(), runId: run.id })}>停止</button>}</div>
              <div className="message user"><span className="avatar">你</span><div><small>你的消息</small><p>{thread.inputs.find(input => input.id === run.id)?.text}</p></div></div>
              {thread.presentations.find(p => p.runId === run.id)?.value.messages.filter(message => message.role === 'assistant').map(message => <div className="message assistant" key={message.id}><span className="avatar">π</span><div><small>{mode==='model'?'Pi · 模型回复':'Pi · 合成演示记录'}</small><p>{message.text}</p>{message.truncated && <small>正文已截断或脱敏</small>}</div></div>)}
              {thread.presentations.find(p => p.runId === run.id)?.value.omitted && <p className="run-note">部分消息超出展示上限；此处仅显示有限摘要。</p>}
              {thread.operations.filter(op => op.runId === run.id).map(op => <div className="tool-card" key={op.id}><span className="file-icon">▤</span><div><strong>{op.shell ? '执行 Bash 命令' : op.tool==='read'?'读取 Markdown':op.tool==='edit'?'修改 Markdown':'写入 Markdown'}</strong><span>{op.shell ? op.shell.intent.command : op.artifactPath}</span>{op.shell?.outcome && <details className="shell-output" open><summary>命令结果 · 退出码 {op.shell.outcome.exitCode ?? op.shell.outcome.signal ?? '未启动'}</summary><p>{op.shell.outcome.timedOut ? '已超时 · ' : ''}{op.shell.outcome.sideEffects === 'possible' ? '可能已有文件改动，不代表回滚。' : '命令未启动。'}{op.shell.outcome.truncated && '输出超过上限，已截断。'}</p><strong>stdout</strong><pre>{op.shell.outcome.stdout}</pre><strong>stderr</strong><pre>{op.shell.outcome.stderr}</pre></details>}</div><span className="tool-status">{(op.shell ? shellLabels : operationLabels)[op.state] ?? '未知操作'}</span></div>)}
              {operationPages?.get(run.id)?.hasMore && <button className="load-operations" disabled={loading || disconnected} onClick={() => loadMore(run.id)}>加载更早工具记录</button>}
              {thread.modelOutcomes?.find(o=>o.runId===run.id)?.value && <p className="run-note">模型状态：{{stop:'回答结束',length:'达到输出上限',cancelled:'已停止',provider_error:'服务请求失败',budget:'预算不足',protocol:'协议异常'}[thread.modelOutcomes.find(o=>o.runId===run.id)!.value!.reason]} · 输入 {thread.modelOutcomes.find(o=>o.runId===run.id)!.value!.inputTokens} / 输出 {thread.modelOutcomes.find(o=>o.runId===run.id)!.value!.outputTokens} token</p>}
              {run.state === 'unknown' && <p className="run-note">不能确认此次执行的最终结果。完成对账后再继续，不会自动重新执行。</p>}
              {run.state === 'cancelled' && <p className="run-note">{modelMode?'本次执行与清理已结束；服务端已发生的费用不会因此撤销。':'执行与清理已结束；已经发生的文件改动不会自动回滚。'}</p>}
            </article>)}
  </>;
}
