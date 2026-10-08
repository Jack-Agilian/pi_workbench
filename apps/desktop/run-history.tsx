import { MessageMarkdown } from './message-markdown.tsx';
import { NativeText } from './native-text.tsx';
import type { DesktopApi } from '../../packages/app-contracts/desktop.ts';
import { modelErrorText } from './model-error-view.ts';
import type { OperationPage } from '../../packages/app-contracts/desktop-pages.ts';
import type { Command, RunState, OperationView } from '../../packages/app-contracts/index.ts';
import type { DesktopHome, DesktopThread } from '../../packages/app-contracts/desktop.ts';
const labels: Record<RunState, string> = { queued: '等待执行', starting: '正在启动', running: '执行中', cancelling: '正在停止 · 等待清理', unknown: '结果待核实', completed: '已完成', failed: '未完成', cancelled: '已取消' };
const operationLabels: Record<string, string> = { pending: '等待你的批准', approved: '已批准', executing: '操作执行中', unknown: '副作用待核实', succeeded: '结果已核实', failed: '操作失败', denied: '已拒绝或撤销' };
const shellLabels: Record<string,string> = { pending: '等待批准', approved: '已批准', executing: '命令执行中', unknown: '执行结果待核实', succeeded: '命令已结束', failed: '命令未成功', denied: '已拒绝或撤销' };

export function RunHistory({api,scope,onRead,thread, pending, openDocument, mode, busy, disconnected, command, operationPages, loading, loadMore}: {onRead:()=>void;api:DesktopApi;scope:string;pending: OperationView[]; openDocument:(id:string,opener:HTMLButtonElement)=>void; operationPages?: ReadonlyMap<string, OperationPage>; loading: boolean; loadMore: (runId: string) => void; thread: DesktopThread; mode: DesktopHome['mode'] | undefined; busy: boolean; disconnected: boolean; command: (value: Command) => Promise<unknown>}) {
  const modelMode = mode === 'model' || mode === 'model-offline';
  const id = () => crypto.randomUUID();
  const runLabel=(run:NonNullable<typeof thread>['runs'][number])=>{
    if(run.state==='completed' && thread.presentations.find(p=>p.runId===run.id)?.value.messages.some(m=>m.role==='tool'))return '已结束 · 有工具失败';
    if(run.state!=='running')return labels[run.state];
    const ops=thread.operations.filter(op=>op.runId===run.id)??[];
    if(pending.some(op=>op.runId===run.id))return '等待你的批准';
    if(ops.some(op=>op.state==='executing'||op.state==='approved'))return '正在执行工具';
    return modelMode?'等待模型回复':'执行中';
  };
  return <>{thread.runs.map(run => {
    const presentation = thread.presentations.find(p => p.runId === run.id)?.value;
    const operations = thread.operations.filter(op => op.runId === run.id);
    const artifacts=[...new Map(thread.artifacts.filter(a=>a.runId===run.id).slice().sort((a,b)=>a.version-b.version).map(a=>[a.path,a] as const)).values()];
    const documentButton=(a:DesktopThread['artifacts'][number])=><button key={a.id} className="chat-document" data-document={a.id} onClick={e=>openDocument(a.id,e.currentTarget)}><span className="file-icon">{a.path.toLowerCase().endsWith('.md')?'MD':'▤'}</span><span><strong>{a.path.split('/').at(-1)}</strong><small>{a.path} · 版本 {a.version}</small></span><span aria-hidden="true">↗</span></button>;
    const outcome = thread.modelOutcomes?.find(o => o.runId === run.id)?.value;
    const hasMore = operationPages?.get(run.id)?.hasMore;
    return <article className={modelMode ? 'run model-run' : 'run'} key={run.id} data-run={run.id} data-state={run.state}>
      <div className="run-label"><span className={`state state-${run.state}`}>{runLabel(run)}</span>
        {['queued','starting','running','cancelling','unknown'].includes(run.state) && <span className="run-permission">本次：{run.permissionMode === 'full' ? '完全访问' : run.permissionMode === 'auto' ? '自动审批' : '人工审批'}</span>}
        {run.state === 'queued' && <button className="stop" disabled={busy || disconnected} onClick={() => void command({type:'runs.cancel', requestId:id(), runId:run.id})}>取消排队</button>}
      </div>
      <section className="run-conversation" aria-label="会话正文">
        <NativeText onRead={onRead} key={`${thread.thread.id}:${run.id}:${scope}`} api={api} threadId={thread.thread.id} runId={run.id} scope={scope} disconnected={disconnected}>
        <div className="message user"><div><small>你</small><MessageMarkdown text={thread.inputs.find(input => input.id === run.id)?.text ?? ''} copyLabel="复制已显示输入"/></div></div>
        {presentation?.messages.filter(message => message.role === 'assistant' || message.role === 'tool').map(message => <div className="message assistant" key={message.id}><div><small>{message.role === 'tool' ? '工具执行提示' : mode === 'model' ? 'Pi' : 'Pi · 合成演示记录'}</small><MessageMarkdown text={message.text} copyLabel="复制已显示正文"/>{message.truncated && <small>正文已截断或脱敏</small>}</div></div>)}
        {presentation?.omitted && <p className="run-note">部分消息超出展示上限；此处仅显示有限摘要。</p>}
        </NativeText>
      </section>
      {(operations.length > 0 || hasMore) && <details className="run-operations" aria-label="操作记录"><summary className="run-section-title" title="独立的操作列表，不表示与正文的先后关系">操作记录 · {operations.length}{hasMore ? '+' : ''}{operations.some(op=>['failed','unknown','denied'].includes(op.state))&&' · 有异常结果'}{pending.some(op=>op.runId===run.id)&&' · 等待输入区审批'}</summary>
        {operations.map(op => <div className="operation-record" key={op.id} data-operation={op.id}>
<div className="tool-card">
          <div><strong>{op.shell ? 'Bash' : op.tool === 'read' ? '读取文件' : op.tool === 'edit' ? '修改文件' : '写入文件'}</strong><span>{op.shell ? op.shell.intent.command : op.artifactPath}</span>
            {op.shell?.outcome && <details className="shell-output"><summary>命令结果 · 退出码 {op.shell.outcome.exitCode ?? op.shell.outcome.signal ?? '未启动'}</summary><p>{op.shell.outcome.timedOut ? '已超时 · ' : ''}{op.shell.outcome.sideEffects === 'possible' ? '可能已有文件改动，不代表回滚。' : '命令未启动。'}{op.shell.outcome.truncated && '输出超过上限，已截断。'}</p><strong>stdout</strong><pre>{op.shell.outcome.stdout}</pre><strong>stderr</strong><pre>{op.shell.outcome.stderr}</pre></details>}
          </div><span className="tool-status">{op.approvalSource !== 'manual' && <small className="approval-source">{op.approvalSource === 'full-tools-v1' ? '完全访问 · 自动批准' : '自动批准'} · </small>}{op.state === 'pending' ? (pending.some(item=>item.id===op.id)?'请在输入区处理审批':'正在同步操作状态') : (op.shell ? shellLabels : operationLabels)[op.state] ?? '未知操作'}</span>
        </div></div>)}
        {hasMore && <button className="load-operations" disabled={loading || disconnected} onClick={() => loadMore(run.id)}>加载更早工具记录</button>}
      </details>}
      <div className="run-documents">{artifacts.slice(0,3).map(documentButton)}{artifacts.length>3&&<details><summary>另有 {artifacts.length-3} 个文档</summary>{artifacts.slice(3).map(documentButton)}</details>}</div>
      {outcome && <details className="run-meta"><summary>运行信息</summary><p>本次权限：{run.permissionMode === 'full' ? '完全访问（应用私有数据仍受保护）' : run.permissionMode === 'auto' ? '自动审批（工作目录）' : '人工审批'}</p><p>模型状态：{{stop:'回答结束',length:'达到输出上限',cancelled:'已停止',provider_error:'模型流程未完成',budget:'预算不足',protocol:'协议异常'}[outcome.reason]} · 输入 {outcome.inputTokens} / 输出 {outcome.outputTokens} token</p></details>}
      {outcome?.reason === 'provider_error' && <p className="run-note model-error" role="alert">{modelErrorText(outcome.error)}</p>}
      {run.state === 'unknown' && <p className="run-note">不能确认此次执行的最终结果。完成对账后再继续，不会自动重新执行。</p>}
      {run.state === 'cancelled' && <p className="run-note">{modelMode ? '本次执行与清理已结束；服务端已发生的费用不会因此撤销。' : '执行与清理已结束；已经发生的文件改动不会自动回滚。'}</p>}
    </article>;
  })}</>;
}
