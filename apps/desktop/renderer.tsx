import { StrictMode, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import type { Command, RunState } from '../../packages/app-contracts/index.ts';
import type { DesktopApi, DesktopHome } from '../../packages/app-contracts/desktop.ts';
import type { ThreadActivity } from '../../packages/app-contracts/desktop-pages.ts';
import { ThreadPages, projectPages, type ThreadPagesView } from './thread-pages.ts';
import { RunHistory } from './run-history.tsx';
import { ApprovalList } from './approval-list.tsx';
import { ArtifactPanel } from './artifact-panel.tsx';
import { useTimelineScroll } from './timeline-scroll.ts';
import { shouldSubmit } from './composer-key.ts';
declare global { interface Window { workbench: DesktopApi } }
const api = window.workbench;
const active = new Set<RunState>(['queued','starting','running','cancelling','unknown']);
const id = () => crypto.randomUUID();
function App() {
  const [inspectorChoices, setInspectorChoices] = useState<Record<string, boolean>>({});
  const [inspectorTabs, setInspectorTabs] = useState<Record<string, 'approvals' | 'artifacts'>>({});
  const [inspectorWidth, setInspectorWidth] = useState('normal');
  const [home, setHome] = useState<DesktopHome | null>(null);
  const [selected, setSelected] = useState('');
  const [activityState, setActivity] = useState<ThreadActivity | null>(null);
  const activity = activityState?.thread.id === selected ? activityState : null;
  const [pageState, setPages] = useState<{id: string; value: ThreadPagesView} | null>(null);
  const pages = pageState?.id === selected ? pageState.value : null;
  const thread = pages && activity ? projectPages(pages, activity) : null;
  const readers = useRef(new Map<string, ThreadPages>());
  const queryScope = useRef('');
  const [pageReader, setPageReader] = useState<ThreadPages | null>(null);
  const tools = pageReader?.threadId === selected ? pageReader.tools : undefined;
  const toolsBusy = useSyncExternalStore(tools?.subscribe ?? (() => () => {}), tools?.busy ?? (() => false));
  const toolsProblem = useSyncExternalStore(tools?.subscribe ?? (() => () => {}), tools?.error ?? (() => ''));
  const [pageProblem, setPageProblem] = useState('');
  const [pageBusy, setPageBusy] = useState(false);
  const pageAction = useRef(false);
  const pageEpoch = useRef(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({}); const [title, setTitle] = useState('');
  const [problem, setProblem] = useState<{ kind: 'connection' | 'request'; text: string } | null>(null); const [disconnected, setDisconnected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false); const [tick, setTick] = useState(0);
  const generation = useRef(0); const commandPending = useRef(false);
  const pendingRuns = useRef(new Map<string, Extract<Command, { type: 'runs.start' }>>());
  const pendingCreation = useRef<Extract<Command, { type: 'threads.create' }> | null>(null);
  const unconfirmedRun = pendingRuns.current.get(selected);
  const draft = drafts[selected] ?? '';
  const scroll = useTimelineScroll(selected, thread);
  const inspectorRef = useRef<HTMLElement>(null);
  const openApprovals = () => { setInspectorTabs(all => ({...all, [selected]: 'approvals'})); setInspectorChoices(all => ({...all, [selected]: true})); requestAnimationFrame(() => inspectorRef.current?.scrollTo({top: 0})); };
  function failed(error: unknown) {
    const lost = error instanceof Error && error.message.includes('disconnected');
    setDisconnected(lost); setProblem({ kind: lost ? 'connection' : 'request', text: lost ? '与执行宿主的连接已断开。原宿主仍在运行时，重新连接会结束其未完成任务并保留记录；不会重发未确认操作。' : '请求未获确认，请刷新状态后检查。审批可能已过期，任务也可能正在停止。刷新只读取状态，不会重发操作或结束任务。' });
  }
  useEffect(() => {
    let disposed = false;
    void api.home().then(value => { if (!disposed) { setHome(value); setSelected(current => current || value.threads[0]?.id || ''); } }, failed);
    return () => { disposed = true; };
  }, []);
  useEffect(() => {
    const current = ++generation.current; let stopped = false; let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const latestHome = await api.home();
        if (stopped || generation.current !== current) return;
        if (latestHome.queryScope && queryScope.current && latestHome.queryScope !== queryScope.current) {
          ++pageEpoch.current;
          for (const reader of readers.current.values()) reader.cancelPending();
          queryScope.current = ''; setTick(n => n + 1);
        }
        setHome(latestHome);
        if (selected) {
          const value = await api.threadActivity(selected);
          if (stopped || generation.current !== current) return;
          setActivity(value);
        }
        if (!stopped) setDisconnected(false);
      } catch (error) { if (!stopped) failed(error); }
      finally { if (!stopped) timer = setTimeout(() => void poll(), 350); }
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [selected, tick]);
  // History errors and slow pages do not block the independent current-activity poll.
  useEffect(() => {
    const epoch = ++pageEpoch.current;
    let stopped = false; let timer: ReturnType<typeof setTimeout>;
    setPageProblem(''); setPageBusy(false); pageAction.current = false;
    if (!selected) return;
    let currentReader: ThreadPages | undefined;
    let initialized = false;
    const poll = async () => {
      if (stopped || pageEpoch.current !== epoch) return;
      try {
        if (!currentReader) {
          const scope = await api.queryScope();
          if (stopped || pageEpoch.current !== epoch) return;
          if (queryScope.current !== scope) {
            for (const [threadId, reader] of readers.current) {
              const positions = reader.browsePositions(); reader.dispose();
              readers.current.set(threadId, new ThreadPages(api, threadId, scope, positions));
            }
            queryScope.current = scope; setPages(null);
          }
          currentReader = readers.current.get(selected);
          if (!currentReader) {
            currentReader = new ThreadPages(api, selected, scope); readers.current.set(selected, currentReader);
          }
          setPageReader(currentReader);
        }
        // Tool read failures require explicit retry. Activity/approval polling stays independent.
        if (currentReader.tools.error()) return;
        const value = await (initialized ? currentReader.poll() : currentReader.refresh());
        initialized = true;
        if (!stopped && pageEpoch.current === epoch) { setPages({id: selected, value}); setPageProblem(''); }
      } catch (error) {
        if (!stopped && pageEpoch.current === epoch && !currentReader?.tools.error()) setPageProblem(pageError(error));
      } finally { if (!stopped && pageEpoch.current === epoch) timer = setTimeout(() => void poll(), 350); }
    };
    void poll();
    return () => { stopped = true; currentReader?.cancelPending(); clearTimeout(timer); };
  }, [selected, tick]);
  useEffect(() => () => {
    for (const reader of readers.current.values()) reader.dispose();
    readers.current.clear();
  }, []);
  function pageError(error: unknown) {
    const code = error instanceof Error ? error.message : '';
    return code === 'page_item_too_large' ? '单条记录超过展示传输上限。已读内容保留，当前审批与停止仍可使用。'
      : code === 'page_cursor_invalid' ? '历史位置已失效，请重新读取已浏览的记录。'
      : '历史或成果暂时无法加载，已读内容保留。可以重试，重试不会重新执行任务。';
  }
  async function loadPages(kind?: string) {
    const reader = readers.current.get(selected);
    if (!reader || pageAction.current) return;
    const epoch = pageEpoch.current;
    const toolPage = kind !== undefined && kind !== 'history' && kind !== 'artifacts';
    if (reader.tools.busy()) return;
    if (!toolPage) { pageAction.current = true; setPageBusy(true); }
    try {
      const value = await (kind ? reader.more(kind) : reader.refresh());
      if (pageEpoch.current === epoch) { setPages({id: selected, value}); setPageProblem(''); }
    } catch (error) { if (pageEpoch.current === epoch && !reader.tools.error()) setPageProblem(pageError(error)); }
    finally { if (pageEpoch.current === epoch) { pageAction.current = false; setPageBusy(false); } }
  }
  async function command(value: Command) {
    if (commandPending.current) return;
    commandPending.current = true; setBusy(true); setProblem(null);
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
    if (!selected || !draft.trim() || commandPending.current || busy || disconnected || !canSend) return;
    const current = selected;
    const intent = pendingRuns.current.get(current) ?? { type: 'runs.start', requestId: id(), threadId: current, input: draft };
    pendingRuns.current.set(current, intent);
    const response = await command(intent);
    if (response && pendingRuns.current.get(current) === intent) {
      pendingRuns.current.delete(current);
      setDrafts(all => all[current] === intent.input ? { ...all, [current]: '' } : all);
    }
  }
  async function refreshStatus() {
    if (refreshing || busy || commandPending.current) return;
    const current = generation.current;
    const observedProblem = problem;
    setRefreshing(true);
    try {
      const latestHome = await api.home();
      if (generation.current !== current) return;
      const latestActivity = selected ? await api.threadActivity(selected) : null;
      // A changed selection/connection owns its own state. Never clear a newer error.
      if (generation.current !== current) return;
      setHome(latestHome);
      if (latestActivity) setActivity(value => value?.thread.id === selected && value.snapshotSeq > latestActivity.snapshotSeq ? value : latestActivity);
      setProblem(value => value === observedProblem ? null : value);
    } catch (error) { if (generation.current === current) failed(error); }
    finally { setRefreshing(false); }
  }
  async function reconnect() {
    setBusy(true); ++pageEpoch.current;
    for (const reader of readers.current.values()) reader.cancelPending();
    setPageReader(null); setPages(null);
    try { await api.reconnect(); setProblem(null); setDisconnected(false); setTick(n => n + 1); }
    catch (error) { failed(error); } finally { setBusy(false); }
  }
  const modelMode=home?.mode==='model'||home?.mode==='model-offline';
  const canSend=activity?.workspaceStatus === 'ready' && (!modelMode||home?.model?.status==='ready');
  const modeLabel=home?.mode==='model'?'模型会话':home?.mode==='model-offline'?'离线会话验证 · SYNTHETIC':'无模型演示';
  const currentRuns = thread?.runs ?? [];
  const pending = activity?.operations.filter(op => op.state === 'pending') ?? [];
  const inspectorTab = inspectorTabs[selected] ?? (pending.length ? 'approvals' : 'artifacts');
  const inspectorOpen = inspectorChoices[selected] ?? (pending.length > 0 || Boolean(thread?.artifacts.length));
  const workspacePath=home?.workspaces.items.find(w=>w.id===(activity?.thread.workspaceId??home.workspaces.selectedId))?.path??'正在读取目录';
  const selectedWorkspace=home?.workspaces.items.find(w=>w.id===home.workspaces.selectedId)?.path??'正在读取目录';
  const shellTools=home?.model?.limits?.shellTools;
  const isWorking = !!activity?.activeRun && active.has(activity.activeRun.state);
  const stoppableRun = activity?.activeRun && ['running','starting','queued'].includes(activity.activeRun.state) ? activity.activeRun : null;
  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">π</span><div>Pi Workbench</div></div>
      <button className="choose-workspace" title={selectedWorkspace} disabled={busy||disconnected||!!pendingCreation.current||Boolean(home?.activeRuns.length)} onClick={()=>{setBusy(true);void api.selectWorkspace().then(()=>setTick(n=>n+1),failed).finally(()=>setBusy(false));}}><span>工作目录</span><strong>{selectedWorkspace.split('/').at(-1)}</strong><small>切换目录 ↗</small></button>
      <button className="new-thread primary" onClick={() => void createThread()} disabled={busy || disconnected}><span>＋</span> {pendingCreation.current ? '重试新建会话' : '新建会话'}</button>
      <details className="new-thread-options"><summary>自定义会话名称</summary><label className="sr-only" htmlFor="title">新会话名称</label><input id="title" placeholder="留空使用默认名称" maxLength={160} value={title} disabled={pendingCreation.current !== null} onChange={event => setTitle(event.target.value)} /></details>
      <div className="section-label">最近会话 <span>{home?.threads.length ?? 0}</span></div>
      <nav aria-label="会话列表">{home?.threads.map(item => <button key={item.id} aria-label={item.title} className={`thread-link ${selected === item.id ? 'selected' : ''}`} aria-current={selected === item.id ? 'page' : undefined} onClick={() => setSelected(item.id)}><span className="thread-identity"><span title={item.title}>{item.title}</span><small title={home.workspaces.items.find(w=>w.id===item.workspaceId)?.path}>{home.workspaces.items.find(w=>w.id===item.workspaceId)?.path.split('/').at(-1) ?? '工作目录'}</small></span><small className="thread-short-id">{item.id.slice(0,6)}</small>{home.activeRuns.some(run => run.threadId === item.id) && <span className="activity-dot" aria-label="有活动任务" />}</button>)}</nav>
      <div className="sidebar-foot"><span className={`status-dot ${disconnected ? 'offline' : ''}`} />{disconnected ? '连接断开' : '本地连接'}</div>
    </aside>
    <main>
      <header className="thread-heading">
        <div className="heading-copy"><h1>{activity?.thread.title ?? '开始一项工作'}</h1><div className="execution-summary"><span title={workspacePath}>{workspacePath}</span></div></div>
        <div className="view-toolbar">
          {pending.length > 0 ? <button className="show-approvals" onClick={openApprovals}><span className="approval-indicator" role="status">{pending.length} 项待审批</span></button> : <span className="approval-indicator sr-only" role="status">暂无待审批</span>}
          {stoppableRun && <button className="stop" aria-label={`停止执行 ${stoppableRun.id}`} disabled={busy || disconnected} onClick={() => void command({type: 'runs.cancel', requestId: id(), runId: stoppableRun.id})}>停止</button>}
          <button className="inspector-toggle" aria-controls="task-inspector" aria-expanded={inspectorOpen} onClick={() => setInspectorChoices(all => ({...all, [selected]: !inspectorOpen}))}>{inspectorOpen ? '隐藏详情' : '查看详情'}</button>
          <details className="context-details"><summary aria-label="会话说明">···</summary><div className="context-popover"><strong>{modeLabel}</strong><p>{modelMode?(shellTools?"文件操作与 Bash 命令须逐项批准。Bash 可改动整个工作目录，禁网并使用隔离环境。":home?.model?.limits?.fileTools?"仅开放逐项批准的 Markdown 文件工具。":"本模式不提供工具。"):"无模型演示：使用合成记录，真实文件操作与命令须逐项批准。"}</p><p>{modelMode?'模型请求仅走配置端点；停止不回滚文件改动或服务端已发生的费用。':'停止不回滚已发生的文件改动。'}</p></div></details>
        </div>
      </header>
      {home?.mode==='model' && <details className="model-settings" aria-label="模型配置" open={home.model?.status!=='ready'}><summary>模型配置 · {home.model?.provider} / {home.model?.model}</summary>{home.model?.limits && <p>{home.model.limits.endpoint} · {home.model.limits.requests===null?'LLM 请求次数不限':`本次授权最多 ${home.model.limits.requests} 次请求`} · {home.model.limits.estimatedUsd===null?'费用不限':`估算预算 $${home.model.limits.estimatedUsd}`}  · {home.model.limits.outputTokens===null?'输出长度使用模型默认':`输出上限 ${home.model.limits.outputTokens} token`}{home.model.limits.httpIdleTimeoutMs!==undefined && <> · 空闲等待 {home.model.limits.httpIdleTimeoutMs/1000} 秒</>}{home.model.limits.timeoutMs!==undefined && <> · 单次 LLM 请求总上限 {home.model.limits.timeoutMs/1000} 秒</>}</p>}{home.model?.status==='not_configured'?<p>尚未配置或配置无效。请先运行 model:config 创建非秘密配置，填写并检查后重新启动。本页不会使用全局 Pi 凭据。</p>:home.model?.status==='key_required'?<div><p>仅发送你批准的合成无敏感资料。请求与费用估算限额来自配置；估算不等于服务商硬预算。可在配置目录的 auth.json 保存 API key，重启后自动读取；也可临时选择私有 .key 文件。凭据内容不会传入页面。</p><button disabled={busy} onClick={()=>{setBusy(true);void api.selectModelCredential().then(()=>setTick(n=>n+1),failed).finally(()=>setBusy(false));}}>选择凭据并启用本次应用</button></div>:home.model?.status==='policy_required'?<p>授权策略待确认。请核对原配置并完成显式修订，已有请求记录继续保留。</p>:home.model?.status==='budget_exhausted'?<p>本授权的请求次数或预留预算不足。</p>:<p>{shellTools?'已就绪 · 文件与 Bash 均须逐项批准':home.model?.limits?.fileTools?'已就绪 · Markdown 读取、写入、修改均须逐项批准':'已就绪 · 无工具'}</p>}</details>}
      {problem && <div className="notice error" role="alert">{problem.text}<button onClick={() => void (problem.kind === 'connection' ? reconnect() : refreshStatus())} disabled={busy || refreshing}>{problem.kind === 'connection' ? '重新连接' : '刷新状态'}</button></div>}
      {activity?.workspaceStatus === 'invalid' && <div className="notice error" role="alert">此会话的工作目录已不可用，发送已停用。历史仍可浏览，请恢复原目录后再继续。</div>}
      {home?.recovery === 'blocked' && <div className="notice" role="status">执行结果或清理尚未核实，新任务暂不执行。<button disabled={busy} onClick={() => { void api.recover().then(value => { setHome(value); setTick(n => n + 1); }, failed); }}>核验并恢复</button></div>}
      <div className="content-grid" data-inspector={inspectorOpen ? 'open' : 'closed'} data-width={inspectorWidth}>
        <section className="conversation" aria-label="会话记录">
          <div className="timeline" ref={scroll.viewport} onScroll={scroll.onScroll} tabIndex={0} aria-label="执行记录"><div className="timeline-content" ref={scroll.content}>
            {(pageProblem || toolsProblem) && <div className="notice" role="status">{toolsProblem ? pageError(new Error(toolsProblem)) : pageProblem}<button className="retry-pages" disabled={pageBusy || toolsBusy || disconnected} onClick={() => void loadPages()}>重新读取记录</button></div>}
            {selected && !pages && !pageProblem && !toolsProblem && <p role="status">正在读取最近记录…</p>}
            {pages?.history.hasMore && <button className="load-history" disabled={pageBusy || toolsBusy || disconnected} onClick={() => { scroll.onScroll(); void loadPages('history'); }}>{pageBusy ? '正在加载…' : '加载更早记录'}</button>}
            {!currentRuns.length && (!selected || pages) && <div className="empty"><div className="empty-mark">π</div><h2>今天想完成什么？</h2><p>{modelMode?'从一个目标开始，在同一会话中持续推进。':'无模型演示 · 体验真实文件操作、审批与成果。'}</p><div className="suggestions">{['整理本周工作记录','记录一次项目讨论','起草下一步行动清单'].map(text => <button key={text} disabled={!selected || !!unconfirmedRun} onClick={() => setDrafts(all => ({ ...all, [selected]: text }))}>{text}<span>↗</span></button>)}</div>{!selected && <p className="hint">先在左侧新建一个会话</p>}</div>}
            {thread && <RunHistory thread={thread} mode={home?.mode} busy={busy} disconnected={disconnected} command={command} operationPages={pages?.operations} loading={pageBusy || toolsBusy} loadMore={runId => void loadPages(runId)} />}
          </div></div>
          {scroll.browsing && <button className="return-latest" onClick={scroll.returnLatest}>返回最新 ↓</button>}
          {!modelMode && !currentRuns.length && <details className="demo-options"><summary>命令演示</summary><div className="suggestions"><button disabled={!selected || !!unconfirmedRun || busy || disconnected} onClick={() => setDrafts(all => ({ ...all, [selected]: '/demo-shell' }))}>填入只读命令演示</button><button disabled={!selected || !!unconfirmedRun || busy || disconnected} onClick={() => setDrafts(all => ({ ...all, [selected]: '/demo-shell-wait' }))}>填入可停止命令演示</button></div></details>}<form className="composer" onSubmit={event => { event.preventDefault(); void submit(); }}>
            <label className="sr-only" htmlFor="composer">你的消息</label><textarea id="composer" placeholder={selected ? '描述你想完成的工作…' : '新建会话后，在这里描述你的目标…'} disabled={!selected || !!unconfirmedRun} value={draft} maxLength={16384} onChange={event => setDrafts(all => ({ ...all, [selected]: event.target.value }))} onKeyDown={event => { if (shouldSubmit(event.nativeEvent)) { event.preventDefault(); void submit(); } }} />
            <div className="composer-footer"><span>{modelMode?(shellTools?'Pi · 文件与 Bash':home?.model?.limits?.fileTools?'Pi · 文件工具':'Pi · 无工具'):'无模型演示'}</span><button className="primary" type="submit" disabled={!selected || !draft.trim() || busy || disconnected || !canSend}>{unconfirmedRun ? '重试未确认请求' : isWorking ? '加入队列' : '发送'} <span>↑</span></button></div>
            {unconfirmedRun && <p role="status">尚未收到确认；重试会核对同一次提交，原内容已保留。</p>}
          </form><p className="composer-hint">Enter 发送 · Shift + Enter 换行</p>
        </section>
        <aside id="task-inspector" ref={inspectorRef} className="inspector" aria-label="审批与成果" hidden={!inspectorOpen}>
          <div className="inspector-nav" aria-label="详情分类"><button data-panel="approvals" aria-pressed={inspectorTab==='approvals'} onClick={()=>setInspectorTabs(all=>({...all,[selected]:'approvals'}))}>审批 <span>{pending.length}</span></button><button data-panel="artifacts" aria-pressed={inspectorTab==='artifacts'} onClick={()=>setInspectorTabs(all=>({...all,[selected]:'artifacts'}))}>成果 <span>{thread?.artifacts.length ?? 0}{pages?.artifacts.hasMore ? '+' : ''}</span></button><details className="rail-options"><summary aria-label="详情显示选项">···</summary><label className="rail-width">栏宽 <select aria-label="审批与成果栏宽" value={inspectorWidth} onChange={event => setInspectorWidth(event.target.value)}><option value="compact">紧凑</option><option value="normal">标准</option><option value="wide">宽</option></select></label></details></div>
          <section className="inspector-panel" aria-label="待审批操作" hidden={inspectorTab!=='approvals'}>
            <ApprovalList pending={pending} workspacePath={workspacePath} modelMode={modelMode} busy={busy} disconnected={disconnected} command={command} />
            {!pending.length && <div className="panel-empty"><h2>暂无待审批操作</h2><p>需要你确认时，会在这里列出具体目标和权限。</p></div>}
          </section>
          <section className="inspector-panel" aria-label="成果浏览" hidden={inspectorTab!=='artifacts'}>
            <ArtifactPanel key={`${selected}:${queryScope.current}`} thread={thread} api={api} disconnected={disconnected} hasMore={pages?.artifacts.hasMore ?? false} loading={pageBusy} loadMore={() => void loadPages('artifacts')} />
            <p className="inspector-foot">{shellTools?'Bash 成功不代表成果已登记；只有核验过的文件版本才列入这里。':'成果由宿主核验后登记，打开时重新检查文件。'}</p>
          </section>
        </aside>
      </div>
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
