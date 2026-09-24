import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Command, RunState } from '../../packages/app-contracts/index.ts';
import type { DesktopApi, DesktopHome, DesktopThread, Preview } from '../../packages/app-contracts/desktop.ts';
import { shouldSubmit } from './composer-key.ts';
declare global { interface Window { workbench: DesktopApi } }
const api = window.workbench;
const labels: Record<RunState, string> = { queued: '等待执行', starting: '正在启动', running: '执行中', cancelling: '正在停止 · 等待清理', unknown: '结果待核实', completed: '已完成', failed: '未完成', cancelled: '已取消' };
const operationLabels: Record<string, string> = { pending: '等待你的批准', approved: '已批准', executing: '正在写入', unknown: '副作用待核实', succeeded: '写入已核实', failed: '写入失败', denied: '已拒绝或撤销' };
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
    const intent = pendingCreation.current ?? { type: 'threads.create', requestId: id(), workspaceId: 'demo-workspace', title: title.trim() || '新的工作记录' };
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
  const currentRuns = thread?.runs ?? [];
  const pending = thread?.operations.filter(op => op.state === 'pending') ?? [];
  const isWorking = currentRuns.some(run => active.has(run.state));
  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">π</span><div>Pi Workbench<small>把想法变成成果</small></div></div>
      <div className="workspace-label"><span className="workspace-icon">▧</span><div>演示工作区<small>本地 · 受管理目录</small></div></div>
      <label className="sr-only" htmlFor="title">新任务名称</label>
      <input id="title" placeholder="新任务名称（可选）" maxLength={160} value={title} disabled={pendingCreation.current !== null} onChange={event => setTitle(event.target.value)} />
      <button className="new-thread" onClick={() => void createThread()} disabled={busy || disconnected}><span>＋</span> {pendingCreation.current ? '重试新建任务' : '新建任务'}</button>
      <div className="section-label">我的任务 <span>{home?.threads.length ?? 0}</span></div>
      <nav aria-label="任务列表">{home?.threads.map(item => <button key={item.id} aria-label={item.title} className={`thread-link ${selected === item.id ? 'selected' : ''}`} aria-current={selected === item.id ? 'page' : undefined} onClick={() => setSelected(item.id)}><span>◷</span><span>{item.title}</span>{home.activeRuns.some(run => run.threadId === item.id) && <span className="activity-dot" aria-label="有活动任务" />}</button>)}</nav>
      <div className="sidebar-foot"><span className="status-dot" /> 本地工作台<small>无模型演示 · SYNTHETIC</small></div>
    </aside>
    <main>
      <header className="topbar"><span>工作台 <span className="muted">/ {thread?.thread.title ?? '开始一项工作'}</span></span><span className="mode-badge">无模型演示</span></header>
      <div className="thread-heading"><div><div className="eyebrow">你的工作，清晰可见</div><h1>{thread?.thread.title ?? '从一个目标开始'}</h1><p>每次发送建立独立任务。文件写入前，由你决定是否批准。</p></div><span className="connection"><i className={disconnected ? 'offline' : ''} />{disconnected ? '连接断开' : '本地连接'}</span></div>
      {problem && <div className="notice error" role="alert">{problem}<button onClick={() => void reconnect()} disabled={busy}>重新连接</button></div>}
      {home?.recovery === 'blocked' && <div className="notice" role="status">执行结果或清理尚未核实，新任务暂不执行。<button disabled={busy} onClick={() => { void api.recover().then(value => { setHome(value); setTick(n => n + 1); }, failed); }}>核验并恢复</button></div>}
      <div className="content-grid">
        <section className="conversation" aria-label="任务时间线">
          <div className="timeline" aria-live="polite">
            {!currentRuns.length && <div className="empty"><span className="empty-mark">✧</span><h2>让第一份成果落地</h2><p>演示会把你的目标写入真实 Markdown 文件，<br />体验任务、审批和成果核验的完整过程。</p><div className="suggestions">{['整理本周工作记录','记录一次项目讨论','起草下一步行动清单'].map(text => <button key={text} disabled={!selected || !!unconfirmedRun} onClick={() => setDrafts(all => ({ ...all, [selected]: text }))}>{text}<span>↗</span></button>)}</div>{!selected && <p className="hint">先在左侧新建一个任务</p>}</div>}
            {currentRuns.map((run, index) => <article className="run" key={run.id} data-run={run.id} data-state={run.state}>
              <div className="run-label"><span>任务 {String(index + 1).padStart(2, '0')}</span><span className={`state state-${run.state}`}>{labels[run.state]}</span>{active.has(run.state) && !['unknown','cancelling'].includes(run.state) && <button className="stop" disabled={busy || disconnected} onClick={() => void command({ type: 'runs.cancel', requestId: id(), runId: run.id })}>停止</button>}</div>
              <div className="message user"><span className="avatar">你</span><div><small>任务目标</small><p>{thread?.inputs.find(input => input.id === run.id)?.text}</p></div></div>
              {thread?.presentations.find(p => p.runId === run.id)?.value.messages.filter(message => message.role === 'assistant').map(message => <div className="message assistant" key={message.id}><span className="avatar">π</span><div><small>Pi · 合成演示记录</small><p>{message.text}</p>{message.truncated && <small>正文已截断或脱敏</small>}</div></div>)}
              {thread?.presentations.find(p => p.runId === run.id)?.value.omitted && <p className="run-note">部分消息超出展示上限；此处仅显示有限摘要。</p>}
              {thread?.operations.filter(op => op.runId === run.id).map(op => <div className="tool-card" key={op.id}><span className="file-icon">▤</span><div><strong>写入 Markdown</strong><span>{op.artifactPath}</span></div><span className="tool-status">{operationLabels[op.state] ?? '未知操作'}</span></div>)}
              {run.state === 'unknown' && <p className="run-note">不能确认此次执行的最终结果。核验现有文件后再继续，不会自动重新写入。</p>}
              {run.state === 'cancelled' && <p className="run-note">执行与清理已结束；已经发生的文件改动不会自动回滚。</p>}
            </article>)}
          </div>
          <form className="composer" onSubmit={event => { event.preventDefault(); void submit(); }}>
            <label className="sr-only" htmlFor="composer">任务目标</label><textarea id="composer" placeholder={selected ? '描述你想完成的工作…' : '新建任务后，在这里描述你的目标…'} disabled={!selected || !!unconfirmedRun} value={draft} maxLength={16384} onChange={event => setDrafts(all => ({ ...all, [selected]: event.target.value }))} onKeyDown={event => { if (shouldSubmit(event.nativeEvent)) { event.preventDefault(); void submit(); } }} />
            <div className="composer-footer"><span>◎ 无模型 · 仅本地 Markdown</span><button className="primary" type="submit" disabled={!selected || !draft.trim() || busy || disconnected}>{unconfirmedRun ? '重试未确认任务' : isWorking ? '加入队列' : '发送任务'} <span>↑</span></button></div>
            <p>{unconfirmedRun ? '此任务尚未收到确认；重试会核对同一次提交，确认前保留原内容。' : 'Enter 发送 · Shift + Enter 换行 · 中文输入法选词不会发送'}</p>
          </form>
        </section>
        <aside className="inspector" aria-label="审批与成果">
          <div className="inspector-title"><h2>审批与成果</h2><span>{pending.length ? `${pending.length} 待处理` : '工作记录'}</span></div>
          {pending.map(op => <section className="approval" key={op.id} aria-label="文件写入审批"><div className="approval-label">需要你的批准</div><h3>新建一个 Markdown 文件</h3><p className="target">{op.artifactPath}</p><dl><dt>执行工具</dt><dd>Pi write</dd><dt>有效范围</dt><dd>仅此任务 · 仅执行一次</dd><dt>数据去向</dt><dd>本地演示工作区</dd><dt>批准截止</dt><dd>{new Date(op.deadline).toLocaleTimeString('zh-CN')}</dd></dl><details><summary>查看参数摘要</summary><code>{op.parametersDigest}</code><p>绑定当前任务与文件版本；目标变化后许可失效。</p></details><div className="approval-actions"><button disabled={busy || disconnected} onClick={() => void command({ type: 'approvals.resolve', requestId: id(), operationId: op.id, parametersDigest: op.parametersDigest, decision: 'deny' })}>拒绝</button><button className="primary" disabled={busy || disconnected} onClick={() => void command({ type: 'approvals.resolve', requestId: id(), operationId: op.id, parametersDigest: op.parametersDigest, decision: 'allow' })}>仅本次允许</button></div></section>)}
          {!pending.length && <div className="approval-empty"><span>✓</span> 暂无待处理审批</div>}
          <h3 className="artifacts-heading">成果文件 <span>{thread?.artifacts.length ?? 0}</span></h3>
          {!thread?.artifacts.length && <div className="artifact-empty"><span>▤</span><p>成果将在这里出现</p><small>只有核验过的真实文件才会登记。</small></div>}
          {thread?.artifacts.map(artifact => <button className={`artifact ${preview?.id === artifact.id ? 'selected-artifact' : ''}`} key={artifact.id} onClick={() => void showArtifact(artifact.id)}><span className="file-icon">M↓</span><div><strong title={artifact.path}>{artifact.path}</strong><small>任务 {currentRuns.findIndex(run => run.id === artifact.runId) + 1} · 版本 {artifact.version} · {artifact.bytes} B · 查看预览</small></div></button>)}
          {preview && <section className="preview"><div><h3>纯文本预览</h3><button aria-label="关闭预览" onClick={() => { previewGeneration.current++; setPreview(null); }}>×</button></div>{preview.value.status === 'ready' ? <pre>{preview.value.text}</pre> : <p role="status">{preview.value.status === 'changed' ? '文件已被外部修改，请重新核验。' : preview.value.status === 'missing' ? '文件已不存在，历史成果记录仍保留。' : '当前无法安全读取此文件。'}</p>}<button onClick={() => void showArtifact(preview.id)}>重新核验文件</button></section>}
          <div className="inspector-foot">演示消息均已标记为合成内容。<br />真实工具会在批准后写入本地文件。</div>
        </aside>
      </div>
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
