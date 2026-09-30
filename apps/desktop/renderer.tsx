import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Command, RunState } from '../../packages/app-contracts/index.ts';
import type { DesktopApi, DesktopHome, DesktopThread, Preview } from '../../packages/app-contracts/desktop.ts';
import { shouldSubmit } from './composer-key.ts';
declare global { interface Window { workbench: DesktopApi } }
const api = window.workbench;
const labels: Record<RunState, string> = { queued: '等待执行', starting: '正在启动', running: '执行中', cancelling: '正在停止 · 等待清理', unknown: '结果待核实', completed: '已完成', failed: '未完成', cancelled: '已取消' };
const operationLabels: Record<string, string> = { pending: '等待你的批准', approved: '已批准', executing: '操作执行中', unknown: '副作用待核实', succeeded: '结果已核实', failed: '操作失败', denied: '已拒绝或撤销' };
const shellLabels: Record<string,string> = { pending: '等待批准', approved: '已批准', executing: '命令执行中', unknown: '执行结果待核实', succeeded: '命令已结束', failed: '命令未成功', denied: '已拒绝或撤销' };
const active = new Set<RunState>(['queued','starting','running','cancelling','unknown']);
const id = () => crypto.randomUUID();
function App() {
  const [home, setHome] = useState<DesktopHome | null>(null);
  const [selected, setSelected] = useState(''); const [threadState, setThread] = useState<DesktopThread | null>(null);
  const thread = threadState?.thread.id === selected ? threadState : null;
  const [drafts, setDrafts] = useState<Record<string, string>>({}); const [title, setTitle] = useState('');
  const [problem, setProblem] = useState(''); const [disconnected, setDisconnected] = useState(false);
  const [busy, setBusy] = useState(false); const [tick, setTick] = useState(0);
  const [previewState, setPreview] = useState<{ threadId: string; id: string; value: Preview } | null>(null);
  const preview = previewState?.threadId === selected ? previewState : null;
  const selectedRef = useRef(selected); selectedRef.current = selected;
  const generation = useRef(0); const commandPending = useRef(false); const previewGeneration = useRef(0);
  const pendingRuns = useRef(new Map<string, Extract<Command, { type: 'runs.start' }>>());
  const pendingCreation = useRef<Extract<Command, { type: 'threads.create' }> | null>(null);
  const unconfirmedRun = pendingRuns.current.get(selected);
  const draft = drafts[selected] ?? '';
  function failed(error: unknown) {
    const lost = error instanceof Error && error.message.includes('disconnected');
    setDisconnected(lost); setProblem(lost ? '与执行宿主的连接已断开。原宿主仍在运行时，重新连接会结束其未完成任务并保留记录；不会重发未确认操作。' : '请求未获确认，请刷新状态后检查。审批可能已过期，任务也可能正在停止。');
  }
  useEffect(() => {
    let disposed = false;
    void api.home().then(value => { if (!disposed) { setHome(value); setSelected(current => current || value.threads[0]?.id || ''); } }, failed);
    return () => { disposed = true; };
  }, []);
  useEffect(() => {
    const current = ++generation.current; let stopped = false; let timer: ReturnType<typeof setTimeout>;
    let cursor: number | undefined;
    setThread(null); setPreview(null); previewGeneration.current++;
    const poll = async () => {
      try {
        const latestHome = await api.home();
        if (stopped || generation.current !== current) return;
        setHome(latestHome);
        if (selected) {
          const changed = cursor === undefined || (await api.events(selected, cursor)).length > 0;
          if (changed) {
            const value = await api.thread(selected);
            if (stopped || generation.current !== current) return;
            cursor = value.cursor; setThread(value);
          }
        }
        if (!stopped) setDisconnected(false);
      } catch (error) { if (!stopped) failed(error); }
      finally { if (!stopped) timer = setTimeout(() => void poll(), 350); }
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [selected, tick]);
  async function command(value: Command) {
    if (commandPending.current) return;
    commandPending.current = true; setBusy(true); setProblem('');
    try { return await api.command(value); } catch (error) { failed(error); return; }
    finally { commandPending.current = false; setBusy(false); }
  }
  async function createThread() {
    if (commandPending.current || busy || disconnected) return;
    const intent = pendingCreation.current ?? { type: 'threads.create', requestId: id(), workspaceId: home?.workspaces.selectedId ?? 'demo-workspace', title: title.trim() || '新的工作记录' };
    pendingCreation.current = intent;
    const response = await command(intent);
    if (response && pendingCreation.current === intent) { pendingCreation.current = null; setTitle(''); setSelected(response.id); setTick(n => n + 1); }
  }
  async function submit() {
    if (!selected || !draft.trim() || commandPending.current || busy || disconnected) return;
    const current = selected;
    const intent = pendingRuns.current.get(current) ?? { type: 'runs.start', requestId: id(), threadId: current, input: draft };
    pendingRuns.current.set(current, intent);
    const response = await command(intent);
    if (response && pendingRuns.current.get(current) === intent) {
      pendingRuns.current.delete(current);
      setDrafts(all => all[current] === intent.input ? { ...all, [current]: '' } : all);
    }
  }
  async function showArtifact(artifactId: string) {
    const current = selected; const currentPreview = ++previewGeneration.current;
    try { const value = await api.preview(artifactId); if (selectedRef.current === current && previewGeneration.current === currentPreview) setPreview({ threadId: current, id: artifactId, value }); }
    catch (error) { if (selectedRef.current === current) failed(error); }
  }
  async function reconnect() {
    setBusy(true);
    try { await api.reconnect(); setProblem(''); setDisconnected(false); setTick(n => n + 1); }
    catch (error) { failed(error); } finally { setBusy(false); }
  }
  const modelMode=home?.mode==='model'||home?.mode==='model-offline';
  const canSend=!modelMode||home?.model?.status==='ready';
  const modeLabel=home?.mode==='model'?'模型会话':home?.mode==='model-offline'?'离线会话验证 · SYNTHETIC':'无模型演示';
  const currentRuns = thread?.runs ?? [];
  const pending = thread?.operations.filter(op => op.state === 'pending') ?? [];
  const workspacePath=home?.workspaces.items.find(w=>w.id===(thread?.thread.workspaceId??home.workspaces.selectedId))?.path??'正在读取目录';
  const selectedWorkspace=home?.workspaces.items.find(w=>w.id===home.workspaces.selectedId)?.path??'正在读取目录';
  const shellTools=home?.model?.limits?.shellTools;
  const runLabel=(run:NonNullable<typeof thread>['runs'][number])=>{
    if(run.state!=='running')return labels[run.state];
    const ops=thread?.operations.filter(op=>op.runId===run.id)??[];
    if(ops.some(op=>op.state==='pending'))return '等待你的批准';
    if(ops.some(op=>op.state==='executing'||op.state==='approved'))return '正在执行工具';
    return modelMode?'等待模型回复':'执行中';
  };
  const isWorking = currentRuns.some(run => active.has(run.state));
  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">π</span><div>Pi Workbench<small>把想法变成成果</small></div></div>
      <div className="workspace-label"><span className="workspace-icon">▧</span><div>新会话工作目录<small title={selectedWorkspace}>{selectedWorkspace.split('/').at(-1)}</small></div></div>
      <button className="choose-workspace" disabled={busy||disconnected||!!pendingCreation.current||Boolean(home?.activeRuns.length)} onClick={()=>{setBusy(true);void api.selectWorkspace().then(()=>setTick(n=>n+1),failed).finally(()=>setBusy(false));}}>选择工作目录</button>
      <label className="sr-only" htmlFor="title">新会话名称</label>
      <input id="title" placeholder="新会话名称（可选）" maxLength={160} value={title} disabled={pendingCreation.current !== null} onChange={event => setTitle(event.target.value)} />
      <button className="new-thread" onClick={() => void createThread()} disabled={busy || disconnected}><span>＋</span> {pendingCreation.current ? '重试新建会话' : '新建会话'}</button>
      <div className="section-label">最近会话 <span>{home?.threads.length ?? 0}</span></div>
      <nav aria-label="会话列表">{home?.threads.map(item => <button key={item.id} aria-label={item.title} className={`thread-link ${selected === item.id ? 'selected' : ''}`} aria-current={selected === item.id ? 'page' : undefined} onClick={() => setSelected(item.id)}><span>◷</span><span>{item.title}</span>{home.activeRuns.some(run => run.threadId === item.id) && <span className="activity-dot" aria-label="有活动任务" />}</button>)}</nav>
      <div className="sidebar-foot"><span className="status-dot" /> 本地工作台<small>{modeLabel}</small></div>
    </aside>
    <main>
      <header className="topbar"><span>工作台 <span className="muted">/ {thread?.thread.title ?? '开始一项工作'}</span></span><span className="mode-badge">{modeLabel}</span></header>
      <div className="thread-heading"><div><div className="eyebrow">你的工作，清晰可见</div><h1>{thread?.thread.title ?? '从一个目标开始'}</h1><p>{modelMode?(shellTools?"逐项批准 Markdown 文件操作与 Bash 命令。Bash 可改动整个工作目录，停止不回滚副作用。":home?.model?.limits?.fileTools?"同一会话继续原生上下文。仅开放逐项批准的 Markdown 文件工具；停止不会回滚已发生的文件改动或费用。":"同一会话继续原生上下文。本模式不提供工具，停止不会撤销服务端已发生的费用。"):"每次发送建立一次执行。文件写入或命令执行前，由你决定是否批准。"}</p></div><span className="connection"><i className={disconnected ? 'offline' : ''} />{disconnected ? '连接断开' : '本地连接'}</span></div>
      <div className="execution-summary"><span title={workspacePath}>工作目录：{workspacePath}</span><span>{shellTools?'Bash 禁网 · 隔离环境 · 逐命令批准':modelMode?'工具受配置限制':'本地演示 · 工具禁网'}{modelMode?' · 模型请求仅走配置端点':''}</span></div>
      {home?.mode==='model' && <details className="model-settings" aria-label="模型配置" open={home.model?.status!=='ready'}><summary>模型配置 · {home.model?.provider} / {home.model?.model}</summary>{home.model?.limits && <p>{home.model.limits.endpoint} · 本次授权最多 {home.model.limits.requests} 次请求 · 估算预算 ${home.model.limits.estimatedUsd} · 输出上限 {home.model.limits.outputTokens} token{home.model.limits.httpIdleTimeoutMs!==undefined && <> · 空闲等待 {home.model.limits.httpIdleTimeoutMs/1000} 秒</>}{home.model.limits.timeoutMs!==undefined && <> · 单次 LLM 请求总上限 {home.model.limits.timeoutMs/1000} 秒</>}</p>}{home.model?.status==='not_configured'?<p>尚未配置或配置无效。请先运行 model:config 创建非秘密配置，填写并检查后重新启动。本页不会使用全局 Pi 凭据。</p>:home.model?.status==='key_required'?<div><p>仅发送你批准的合成无敏感资料。请求与费用估算限额来自配置；估算不等于服务商硬预算。可在配置目录的 auth.json 保存 API key，重启后自动读取；也可临时选择私有 .key 文件。凭据内容不会传入页面。</p><button disabled={busy} onClick={()=>{setBusy(true);void api.selectModelCredential().then(()=>setTick(n=>n+1),failed).finally(()=>setBusy(false));}}>选择凭据并启用本次应用</button></div>:home.model?.status==='policy_required'?<p>授权策略待确认。请核对原配置并完成显式修订，已有请求记录继续保留。</p>:home.model?.status==='budget_exhausted'?<p>本授权的请求次数或预留预算不足。</p>:<p>{shellTools?'已就绪 · 文件与 Bash 均须逐项批准':home.model?.limits?.fileTools?'已就绪 · Markdown 读取、写入、修改均须逐项批准':'已就绪 · 无工具'}</p>}</details>}
      {problem && <div className="notice error" role="alert">{problem}<button onClick={() => void reconnect()} disabled={busy}>重新连接</button></div>}
      {home?.recovery === 'blocked' && <div className="notice" role="status">执行结果或清理尚未核实，新任务暂不执行。<button disabled={busy} onClick={() => { void api.recover().then(value => { setHome(value); setTick(n => n + 1); }, failed); }}>核验并恢复</button></div>}
      <div className="content-grid">
        <section className="conversation" aria-label="会话时间线">
          <div className="timeline" aria-live="polite">
            {!currentRuns.length && <div className="empty"><span className="empty-mark">✧</span><h2>{modelMode?'开始一段会话':'让第一份成果落地'}</h2><p>{modelMode?'发送消息、继续上下文；离线验证回复会明确标为合成内容。':'演示会把你的目标写入真实 Markdown 文件，体验审批和成果核验。'}</p><div className="suggestions">{['整理本周工作记录','记录一次项目讨论','起草下一步行动清单'].map(text => <button key={text} disabled={!selected || !!unconfirmedRun} onClick={() => setDrafts(all => ({ ...all, [selected]: text }))}>{text}<span>↗</span></button>)}</div>{!selected && <p className="hint">先在左侧新建一个会话</p>}</div>}
            {currentRuns.map((run) => <article className={modelMode?'run model-run':'run'} key={run.id} data-run={run.id} data-state={run.state}>
              <div className="run-label"><span>本次执行</span><span className={`state state-${run.state}`}>{runLabel(run)}</span>{active.has(run.state) && !['unknown','cancelling'].includes(run.state) && <button className="stop" disabled={busy || disconnected} onClick={() => void command({ type: 'runs.cancel', requestId: id(), runId: run.id })}>停止</button>}</div>
              <div className="message user"><span className="avatar">你</span><div><small>你的消息</small><p>{thread?.inputs.find(input => input.id === run.id)?.text}</p></div></div>
              {thread?.presentations.find(p => p.runId === run.id)?.value.messages.filter(message => message.role === 'assistant').map(message => <div className="message assistant" key={message.id}><span className="avatar">π</span><div><small>{home?.mode==='model'?'Pi · 模型回复':'Pi · 合成演示记录'}</small><p>{message.text}</p>{message.truncated && <small>正文已截断或脱敏</small>}</div></div>)}
              {thread?.presentations.find(p => p.runId === run.id)?.value.omitted && <p className="run-note">部分消息超出展示上限；此处仅显示有限摘要。</p>}
              {thread?.operations.filter(op => op.runId === run.id).map(op => <div className="tool-card" key={op.id}><span className="file-icon">▤</span><div><strong>{op.shell ? '执行 Bash 命令' : op.tool==='read'?'读取 Markdown':op.tool==='edit'?'修改 Markdown':'写入 Markdown'}</strong><span>{op.shell ? op.shell.intent.command : op.artifactPath}</span>{op.shell?.outcome && <details className="shell-output" open><summary>命令结果 · 退出码 {op.shell.outcome.exitCode ?? op.shell.outcome.signal ?? '未启动'}</summary><p>{op.shell.outcome.timedOut ? '已超时 · ' : ''}{op.shell.outcome.sideEffects === 'possible' ? '可能已有文件改动，不代表回滚。' : '命令未启动。'}{op.shell.outcome.truncated && '输出超过上限，已截断。'}</p><strong>stdout</strong><pre>{op.shell.outcome.stdout}</pre><strong>stderr</strong><pre>{op.shell.outcome.stderr}</pre></details>}</div><span className="tool-status">{(op.shell ? shellLabels : operationLabels)[op.state] ?? '未知操作'}</span></div>)}
              {thread?.modelOutcomes?.find(o=>o.runId===run.id)?.value && <p className="run-note">模型状态：{{stop:'回答结束',length:'达到输出上限',cancelled:'已停止',provider_error:'服务请求失败',budget:'预算不足',protocol:'协议异常'}[thread.modelOutcomes.find(o=>o.runId===run.id)!.value!.reason]} · 输入 {thread.modelOutcomes.find(o=>o.runId===run.id)!.value!.inputTokens} / 输出 {thread.modelOutcomes.find(o=>o.runId===run.id)!.value!.outputTokens} token</p>}
              {run.state === 'unknown' && <p className="run-note">不能确认此次执行的最终结果。完成对账后再继续，不会自动重新执行。</p>}
              {run.state === 'cancelled' && <p className="run-note">{modelMode?'本次执行与清理已结束；服务端已发生的费用不会因此撤销。':'执行与清理已结束；已经发生的文件改动不会自动回滚。'}</p>}
            </article>)}
          </div>
          {!modelMode && <div className="suggestions"><button disabled={!selected || !!unconfirmedRun || busy || disconnected} onClick={() => setDrafts(all => ({ ...all, [selected]: '/demo-shell' }))}>填入只读命令演示</button><button disabled={!selected || !!unconfirmedRun || busy || disconnected} onClick={() => setDrafts(all => ({ ...all, [selected]: '/demo-shell-wait' }))}>填入可停止命令演示</button></div>}<form className="composer" onSubmit={event => { event.preventDefault(); void submit(); }}>
            <label className="sr-only" htmlFor="composer">你的消息</label><textarea id="composer" placeholder={selected ? '描述你想完成的工作…' : '新建会话后，在这里描述你的目标…'} disabled={!selected || !!unconfirmedRun} value={draft} maxLength={16384} onChange={event => setDrafts(all => ({ ...all, [selected]: event.target.value }))} onKeyDown={event => { if (shouldSubmit(event.nativeEvent)) { event.preventDefault(); void submit(); } }} />
            <div className="composer-footer"><span>{modelMode?(shellTools?'◎ 会话 · 文件与受限 Bash':home?.model?.limits?.fileTools?'◎ 会话 · 有限文件工具':'◎ 会话 · 无工具'):'◎ 无模型 · 本地文件与受限命令'}</span><button className="primary" type="submit" disabled={!selected || !draft.trim() || busy || disconnected || !canSend}>{unconfirmedRun ? '重试未确认请求' : isWorking ? '加入队列' : '发送'} <span>↑</span></button></div>
            <p>{unconfirmedRun ? '此任务尚未收到确认；重试会核对同一次提交，确认前保留原内容。' : 'Enter 发送 · Shift + Enter 换行 · 中文输入法选词不会发送'}</p>
          </form>
        </section>
        <aside className="inspector" aria-label="审批与成果">
          <div className="inspector-title"><h2>审批与成果</h2><span>{pending.length ? `${pending.length} 待处理` : '工作记录'}</span></div>
          {pending.map(op => <section className="approval" key={op.id} aria-label={op.shell ? '命令执行审批' : op.tool==='read'?'文件读取审批':'文件写入审批'}><div className="approval-label">需要你的批准</div><h3>{op.shell ? '执行受限 Bash 命令' : op.tool==='read'?'读取批准的 Markdown':op.tool==='edit'?'修改一个 Markdown 文件':op.file?.fileVersion?'替换一个 Markdown 文件':'新建一个 Markdown 文件'}</h3><p className="target">{op.shell ? op.shell.intent.command : op.artifactPath}</p>{op.shell && <p>目录：{workspacePath} · {op.shell.intent.profile} · 最长 {op.shell.intent.timeoutMs / 1000} 秒 · 禁网、隔离环境。命令可能改动工作区文件。</p>}<dl><dt>执行工具</dt><dd>{`Pi ${op.tool}`}</dd><dt>有效范围</dt><dd>仅此任务 · 仅执行一次</dd><dt>数据去向</dt><dd>{modelMode?'批准工作区；工具结果将发送给本次模型':'当前批准工作区'}</dd><dt>批准截止</dt><dd>{new Date(op.deadline).toLocaleTimeString('zh-CN')}</dd></dl>{op.file&&<details><summary>{op.file.summary} · 版本 {op.file.fileVersion?.slice(0,12)??'尚不存在'}</summary><pre>{op.file.preview}</pre><small>仅展示安全摘要，超长内容截断。</small></details>}<details><summary>查看参数摘要</summary><code>{op.parametersDigest}</code><p>{op.shell ? '绑定当前任务、命令、目录、执行配置和期限；只执行一次。' : '绑定当前任务与文件版本；目标变化后许可失效。'}</p></details><div className="approval-actions"><button disabled={busy || disconnected} onClick={() => void command({ type: 'approvals.resolve', requestId: id(), operationId: op.id, parametersDigest: op.parametersDigest, decision: 'deny' })}>拒绝</button><button className="primary" disabled={busy || disconnected} onClick={() => void command({ type: 'approvals.resolve', requestId: id(), operationId: op.id, parametersDigest: op.parametersDigest, decision: 'allow' })}>仅本次允许</button></div></section>)}
          {!pending.length && <div className="approval-empty"><span>✓</span> 暂无待处理审批</div>}
          <h3 className="artifacts-heading">成果文件 <span>{thread?.artifacts.length ?? 0}</span></h3>
          {!thread?.artifacts.length && <div className="artifact-empty"><span>▤</span><p>成果将在这里出现</p><small>只有核验过的真实文件才会登记。</small></div>}
          {thread?.artifacts.map(artifact => <button className={`artifact ${preview?.id === artifact.id ? 'selected-artifact' : ''}`} key={artifact.id} onClick={() => void showArtifact(artifact.id)}><span className="file-icon">M↓</span><div><strong title={artifact.path}>{artifact.path}</strong><small>任务 {currentRuns.findIndex(run => run.id === artifact.runId) + 1} · 版本 {artifact.version} · {artifact.bytes} B · 查看预览</small></div></button>)}
          {preview && <section className="preview"><div><h3>纯文本预览</h3><button aria-label="关闭预览" onClick={() => { previewGeneration.current++; setPreview(null); }}>×</button></div>{preview.value.status === 'ready' ? <pre>{preview.value.text}</pre> : <p role="status">{preview.value.status === 'changed' ? '文件已被外部修改，请重新核验。' : preview.value.status === 'missing' ? '文件已不存在，历史成果记录仍保留。' : '当前无法安全读取此文件。'}</p>}<button onClick={() => void showArtifact(preview.id)}>重新核验文件</button></section>}
          <div className="inspector-foot">{modelMode?(shellTools?'Bash 可改动非 Markdown 文件；命令成功不自动登记成果。':home?.model?.limits?.fileTools?'仅核验成功的写入或修改登记成果；读取也须批准。':'无工具会话，不产生文件成果。'):'演示消息均已标记为合成内容，真实工具只在批准后执行。'}</div>
        </aside>
      </div>
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
