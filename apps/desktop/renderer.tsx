import { StrictMode, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import type { Command, RunState } from '../../packages/app-contracts/index.ts';
import type { DesktopApi, DesktopHome } from '../../packages/app-contracts/desktop.ts';
import type { ThreadActivity } from '../../packages/app-contracts/desktop-pages.ts';
import { ThreadPages, projectPages, type ThreadPagesView } from './thread-pages.ts';
import { RunHistory } from './run-history.tsx';
import { PaneResizeHandle } from './pane-resize-handle.tsx';
import { usePaneLayout } from './pane-layout.ts';
import { RunStatusNotice } from './run-status-notice.tsx';
import { OtherRuns } from './other-runs.tsx';
import { ThreadDirectory } from './thread-directory.tsx';
import { PermissionPicker } from './permission-picker.tsx';
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
  const [problem, setProblem] = useState<{ kind: 'request'; text: string } | null>(null);
  const [disconnected, setDisconnected] = useState(false), [readProblem, setReadProblem] = useState(false);
  // A successful read started before a newer failure cannot prove recovery.
  const healthRevision = useRef(0), connectionLost = useRef(false), reconnecting = useRef(false);
  const approvalFocus = useRef<{element: HTMLElement; threadId: string} | null>(null);
  const [approvalNotice, setApprovalNotice] = useState<{threadId: string; text: string} | null>(null);
  const [permissionPending, setPermissionPending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false); const [tick, setTick] = useState(0);
  const generation = useRef(0); const commandPending = useRef(false);
  const pendingRuns = useRef(new Map<string, Extract<Command, { type: 'runs.start' }>>());
  const pendingCreation = useRef<Extract<Command, { type: 'threads.create' }> | null>(null);
  const unconfirmedRun = pendingRuns.current.get(selected);
  const draft = drafts[selected] ?? '';
  const scroll = useTimelineScroll(selected, thread);
  const inspectorRef = useRef<HTMLElement>(null);
  const sidebarRef=useRef<HTMLElement>(null);
  function failed(error: unknown, source: 'request' | 'read' = 'request') {
    ++healthRevision.current;
    if (error instanceof Error && error.message === 'disconnected') {
      connectionLost.current = true; setDisconnected(true);
    }
    if (source === 'read') setReadProblem(true);
    else setProblem({kind: 'request', text: '请求未获确认，请刷新状态后检查。审批可能已过期，任务也可能正在停止。刷新只读取状态，不会重发操作或结束任务。'});
  }
  function readSucceeded(revision: number) {
    if (healthRevision.current !== revision || reconnecting.current) return;
    connectionLost.current = false; setDisconnected(false); setReadProblem(false);
    // Request confirmation is separate: a live connection does not acknowledge a command.
  }
  useEffect(() => {
    let disposed = false;
    void api.home().then(value => { if (!disposed) { setHome(value); setSelected(current => current || value.threads[0]?.id || ''); } }, error => { if (!disposed) failed(error, 'read'); });
    return () => { disposed = true; };
  }, []);
  useEffect(() => {
    const current = ++generation.current; let stopped = false; let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      const revision = healthRevision.current;
      try {
        if (reconnecting.current) return;
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
        if (!stopped) readSucceeded(revision);
      } catch (error) { if (!stopped && generation.current === current) failed(error, 'read'); }
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
    // Capture before disabling the clicked control; Chromium can move focus to body
    // without another focus event, especially while the native window is occluded.
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused.closest('[data-approval]')) approvalFocus.current = {element: focused, threadId: selected};
    commandPending.current = true; setBusy(true); setProblem(null);
    try { return await api.command(value); } catch (error) {
      if (value.type === 'runs.start' && error instanceof Error && error.message === 'permission_changed') {
        if (pendingRuns.current.get(value.threadId) === value) pendingRuns.current.delete(value.threadId);
        setProblem({kind: 'request', text: '权限模式已变化，此次任务尚未接收。请核对输入区的模式后重新发送，草稿已保留。'}); setTick(n => n + 1);
      } else failed(error);
      return;
    }
    finally { commandPending.current = false; setBusy(false); }
  }
  async function createThread() {
    if (commandPending.current || busy || disconnected) return;
    const intent = pendingCreation.current ?? { type: 'threads.create', requestId: id(), workspaceId: home?.workspaces.selectedId ?? 'demo-workspace', title: title.trim() || '新的工作记录' };
    pendingCreation.current = intent;
    const response = await command(intent);
    if (response && pendingCreation.current === intent) { pendingCreation.current = null; setTitle(''); setSelected(response.id); layout.closeDrawer(); const options=document.querySelector<HTMLDetailsElement>('.new-thread-options');if(options)options.open=false; setTick(n => n + 1); }
  }
  async function submit() {
    if (!selected || !draft.trim() || commandPending.current || busy || disconnected || permissionPending || !activity || !canSend) return;
    const current = selected;
    const intent = pendingRuns.current.get(current) ?? { type: 'runs.start', requestId: id(), threadId: current, input: draft, permissionRevision: activity.thread.permissionRevision ?? 0 };
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
    const revision = healthRevision.current;
    setRefreshing(true);
    try {
      const latestHome = await api.home();
      if (generation.current !== current) return;
      const latestActivity = selected ? await api.threadActivity(selected) : null;
      // A changed selection/connection owns its own state. Never clear a newer error.
      if (generation.current !== current) return;
      setHome(latestHome);
      if (latestActivity) setActivity(value => value?.thread.id === selected && value.snapshotSeq > latestActivity.snapshotSeq ? value : latestActivity);
      readSucceeded(revision);
      setProblem(value => healthRevision.current === revision && value === observedProblem ? null : value);
    } catch (error) { if (generation.current === current) failed(error, 'read'); }
    finally { setRefreshing(false); }
  }
  async function reconnect() {
    if (!connectionLost.current || reconnecting.current || commandPending.current) return;
    reconnecting.current = true; ++generation.current;
    setBusy(true); ++pageEpoch.current;
    for (const reader of readers.current.values()) reader.cancelPending();
    setPageReader(null); setPages(null);
    try { await api.reconnect(); connectionLost.current = false; setDisconnected(false); setReadProblem(false); }
    catch (error) { failed(error, 'read'); } finally { reconnecting.current = false; setBusy(false); setTick(n => n + 1); }
  }
  const modelMode=home?.mode==='model'||home?.mode==='model-offline';
  const canSend=activity?.workspaceStatus === 'ready' && (!modelMode||home?.model?.status==='ready');
  const modeLabel=home?.mode==='model'?'模型会话':home?.mode==='model-offline'?'离线会话验证 · SYNTHETIC':'无模型演示';
  const currentRuns = thread?.runs ?? [];
  const pending = activity?.operations.filter(op => op.state === 'pending') ?? [];
  const inspectorOpen = inspectorChoices[selected] ?? false;
  const unplacedApprovals = pending.filter(op => !thread?.runs.some(run => run.id === op.runId));
  const openApprovals = () => {
    if (!pending[0]) return;
    setInspectorChoices(all => ({...all, [selected]: false}));
    scroll.revealApproval(pending[0].id);
  };
  useLayoutEffect(() => {
    const focused = approvalFocus.current;
    if (!focused || focused.element.isConnected) return;
    approvalFocus.current = null;
    if (focused.threadId !== selected || (document.activeElement !== document.body && document.activeElement !== null)) return;
    setApprovalNotice({threadId: selected, text: pending.length ? '审批列表已更新，已定位下一项待确认操作。' : '此操作已不再等待审批，请查看操作记录确认结果。'});
    if (pending[0]) scroll.revealApproval(pending[0].id);
    else {
      const composer = document.querySelector<HTMLTextAreaElement>('#composer');
      (composer && !composer.disabled ? composer : scroll.viewport.current)?.focus({preventScroll: true});
    }
  });
  const layout = usePaneLayout(inspectorOpen);
  useEffect(() => {
    if (layout.overlay && inspectorOpen) inspectorRef.current?.querySelector<HTMLButtonElement>('.inspector-close')?.focus();
  }, [layout.overlay, inspectorOpen]);
  const closeDrawer=()=>{layout.closeDrawer();requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('.sidebar-toggle')?.focus());};
  useEffect(()=>{if(layout.narrow&&layout.sidebarOpen)sidebarRef.current?.querySelector<HTMLButtonElement>('.sidebar-close')?.focus();},[layout.narrow,layout.sidebarOpen]);
  const closeInspector = () => { setInspectorChoices(all => ({...all, [selected]: false})); document.querySelector<HTMLButtonElement>('.inspector-toggle')?.focus(); };
  const workspacePath=home?.workspaces.items.find(w=>w.id===(activity?.thread.workspaceId??home.workspaces.selectedId))?.path??'正在读取目录';
  const selectedWorkspace=home?.workspaces.items.find(w=>w.id===home.workspaces.selectedId)?.path??'正在读取目录';
  const shellTools=home?.model?.limits?.shellTools;
  const isWorking = !!activity?.activeRun && active.has(activity.activeRun.state);
  const stoppableRun = activity?.activeRun && ['running','starting','queued'].includes(activity.activeRun.state) ? activity.activeRun : null;
  return <div className="shell" data-narrow={layout.narrow} onFocusCapture={event => {
    const element = event.target;
    approvalFocus.current = element instanceof HTMLElement && element.closest('[data-approval]') ? {element, threadId: selected} : null;
  }}>
    {layout.narrow&&layout.sidebarOpen&&<button className="navigation-backdrop" tabIndex={-1} aria-label="关闭导航" onClick={closeDrawer}/>}
    <aside id="workspace-navigation" ref={sidebarRef} className="sidebar" aria-label="会话导航" role={layout.narrow?'dialog':undefined} aria-modal={layout.narrow&&layout.sidebarOpen?true:undefined} hidden={!layout.sidebarOpen} style={{width: layout.sidebarWidth}} onKeyDown={event=>{
      if(!layout.narrow||!layout.sidebarOpen||event.defaultPrevented)return;
      if(event.key==='Escape'){event.preventDefault();closeDrawer();}
      if(event.key==='Tab'){
        const controls=[...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),summary,[tabindex="0"]')].filter(el=>el.getClientRects().length>0);
        const first=controls[0],last=controls.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    }}>
      {layout.sidebarOpen && !layout.narrow && <PaneResizeHandle label="导航栏宽度" controls="workspace-navigation" edge="right" width={layout.sidebarWidth} min={layout.sidebarMin} max={layout.sidebarMax} onResize={layout.resizeSidebar} onReset={layout.resetSidebar} />}
      <div className="brand"><span className="brand-mark">π</span><div>Pi Workbench</div>{layout.narrow&&<button className="sidebar-close" aria-label="关闭导航" onClick={closeDrawer}>×</button>}</div>
      <button className="choose-workspace" title={selectedWorkspace} disabled={busy||disconnected||!!pendingCreation.current||Boolean(home?.activeRuns.length)} onClick={()=>{setBusy(true);void api.selectWorkspace().then(()=>setTick(n=>n+1),failed).finally(()=>setBusy(false));}}><span>工作目录</span><strong>{selectedWorkspace.split('/').at(-1)}</strong><small>切换目录 ↗</small></button>
      <div className="new-thread-controls"><button className="new-thread primary" onClick={() => void createThread()} disabled={busy || disconnected}><span>＋</span> {pendingCreation.current ? '重试新建会话' : '新建会话'}</button>
      <details className="new-thread-options"><summary aria-label="自定义会话名称" title="自定义会话名称">···</summary><div className="new-thread-popover"><label className="sr-only" htmlFor="title">新会话名称</label><input id="title" placeholder="留空使用默认名称" maxLength={160} value={title} disabled={pendingCreation.current !== null} onChange={event => setTitle(event.target.value)} /></div></details></div>
      <ThreadDirectory api={api} home={home} current={activity?.thread??null} selected={selected} select={id=>{setSelected(id);if(layout.narrow)closeDrawer();}} disconnected={disconnected} changed={()=>setTick(n=>n+1)} />
      <div className="sidebar-foot"><span className={`status-dot ${disconnected ? 'offline' : ''}`} />{disconnected ? '连接断开' : '本地连接'}</div>
    </aside>
    <main inert={layout.narrow&&layout.sidebarOpen}>
      <header className="thread-heading">
        <button className="sidebar-toggle" aria-label={layout.sidebarOpen ? '收起导航' : '展开导航'} title={layout.sidebarOpen ? '收起导航' : '展开导航'} aria-controls="workspace-navigation" aria-expanded={layout.sidebarOpen} onClick={layout.toggleSidebar}>☰</button>
        <div className="heading-copy"><h1>{activity?.thread.title ?? '开始一项工作'}</h1><div className="execution-summary"><span title={workspacePath}>{workspacePath}</span></div></div>
        <div className="view-toolbar">
          {pending.length > 0 ? <button className="show-approvals" onClick={openApprovals}><span className="approval-indicator" role="status">{pending.length} 项待审批</span></button> : <span className="approval-indicator sr-only" role="status">暂无待审批</span>}
          {stoppableRun && <button className="stop" aria-label={`停止执行 ${stoppableRun.id}`} disabled={busy || disconnected} onClick={() => void command({type: 'runs.cancel', requestId: id(), runId: stoppableRun.id})}>停止</button>}
          <button className="inspector-toggle" aria-controls="task-inspector" aria-expanded={inspectorOpen} onClick={() => setInspectorChoices(all => ({...all, [selected]: !inspectorOpen}))}>{inspectorOpen ? '隐藏详情' : '查看详情'}</button>
          <details className="context-details"><summary aria-label="会话说明">···</summary><div className="context-popover"><strong>{modeLabel}</strong><p>{modelMode?(shellTools?"文件与 Bash 经宿主授权，按每个任务接收时的权限模式执行。人工与自动模式限定工作目录且 Bash 禁网；完全访问可操作目录外文件并让 Bash 联网。所有模式保留应用私有数据保护与隔离环境。":home?.model?.limits?.fileTools?"文件工具按任务固定模式授权：人工与自动模式限定工作目录内 Markdown，完全访问允许目录外文本文件。应用私有数据始终受保护。":"本模式不提供工具。"):"无模型演示：使用合成记录；真实工具依照任务固定的权限模式授权。"}</p><p>{modelMode?'模型请求仅走配置端点；停止不回滚文件改动或服务端已发生的费用。':'停止不回滚已发生的文件改动。'}</p></div></details>
        </div>
      </header>
      {home?.mode==='model' && <details className="model-settings" aria-label="模型配置" open={home.model?.status!=='ready'}><summary>模型配置 · {home.model?.provider} / {home.model?.model}</summary>{home.model?.limits && <p>{home.model.limits.endpoint} · {home.model.limits.requests===null?'LLM 请求次数不限':`本次授权最多 ${home.model.limits.requests} 次请求`} · {home.model.limits.estimatedUsd===null?'费用不限':`估算预算 $${home.model.limits.estimatedUsd}`}  · {home.model.limits.outputTokens===null?'输出长度使用模型默认':`输出上限 ${home.model.limits.outputTokens} token`}{home.model.limits.httpIdleTimeoutMs!==undefined && <> · 空闲等待 {home.model.limits.httpIdleTimeoutMs/1000} 秒</>}{home.model.limits.timeoutMs!==undefined && <> · 单次 LLM 请求总上限 {home.model.limits.timeoutMs/1000} 秒</>}</p>}{home.model?.status==='not_configured'?<p>尚未配置或配置无效。请先运行 model:config 创建非秘密配置，填写并检查后重新启动。本页不会使用全局 Pi 凭据。</p>:home.model?.status==='key_required'?<div><p>仅发送你批准的合成无敏感资料。请求与费用估算限额来自配置；估算不等于服务商硬预算。可在配置目录的 auth.json 保存 API key，重启后自动读取；也可临时选择私有 .key 文件。凭据内容不会传入页面。</p><button disabled={busy} onClick={()=>{setBusy(true);void api.selectModelCredential().then(()=>setTick(n=>n+1),failed).finally(()=>setBusy(false));}}>选择凭据并启用本次应用</button></div>:home.model?.status==='policy_required'?<p>授权策略待确认。请核对原配置并完成显式修订，已有请求记录继续保留。</p>:home.model?.status==='budget_exhausted'?<p>本授权的请求次数或预留预算不足。</p>:<p>{shellTools?'已就绪 · 文件与 Bash 由宿主按任务权限授权':home.model?.limits?.fileTools?'已就绪 · Markdown 工具由宿主按任务权限授权':'已就绪 · 无工具'}</p>}</details>}
      {disconnected ? <div className="notice error connection-problem" role="alert">与执行宿主的连接已断开。原宿主仍在运行时，重新连接会结束其未完成任务并保留记录；不会重发未确认操作。<button onClick={() => void reconnect()} disabled={busy || refreshing}>重新连接</button></div>
        : (problem || readProblem) && <div className="notice error request-problem" role="alert">{problem?.text ?? '状态暂时无法读取，已显示内容保留。刷新只读取状态，不会重发操作或结束任务。'}<button onClick={() => void refreshStatus()} disabled={busy || refreshing}>刷新状态</button></div>}
      <OtherRuns key={home?.queryScope??''} home={home} selected={selected} disabled={busy||disconnected} command={command} select={threadId=>{setSelected(threadId);setInspectorChoices(all=>({...all,[threadId]:false}));requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('.sidebar-toggle')?.focus());}}/>
      <RunStatusNotice key={`${selected}:${queryScope.current}`} runs={currentRuns}/>
      <p className="sr-only approval-announcement" role="status" aria-live="polite" aria-atomic="true">{approvalNotice?.threadId === selected ? approvalNotice.text : ''}</p>
      {activity?.workspaceStatus === 'invalid' && <div className="notice error" role="alert">此会话的工作目录已不可用，发送已停用。历史仍可浏览，请恢复原目录后再继续。</div>}
      {home?.recovery === 'blocked' && <div className="notice" role="status">执行结果或清理尚未核实，新任务暂不执行。<button disabled={busy} onClick={() => { void api.recover().then(value => { setHome(value); setTick(n => n + 1); }, failed); }}>核验并恢复</button></div>}
      <div className="content-grid" data-inspector={inspectorOpen ? 'open' : 'closed'} data-overlay={layout.overlay}>
        <section className="conversation" aria-label="会话记录" inert={layout.overlay && inspectorOpen}>
          <div className="timeline" ref={scroll.viewport} onScroll={scroll.onScroll} onWheel={scroll.onUserScroll} onKeyDown={event => { if (['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)) scroll.onUserScroll(); }} onPointerDown={event => { if (event.target === event.currentTarget && event.clientX >= event.currentTarget.getBoundingClientRect().right - 18) scroll.onUserScroll(); }} tabIndex={0} aria-label="执行记录"><div className="timeline-content" ref={scroll.content}>
            {(pageProblem || toolsProblem) && <div className="notice" role="status">{toolsProblem ? pageError(new Error(toolsProblem)) : pageProblem}<button className="retry-pages" disabled={pageBusy || toolsBusy || disconnected} onClick={() => void loadPages()}>重新读取记录</button></div>}
            {selected && !pages && !pageProblem && !toolsProblem && <p role="status">正在读取最近记录…</p>}
            {pages?.history.hasMore && <button className="load-history" disabled={pageBusy || toolsBusy || disconnected} onClick={() => { scroll.onScroll(); void loadPages('history'); }}>{pageBusy ? '正在加载…' : '加载更早记录'}</button>}
            {!currentRuns.length && (!selected || pages) && <div className="empty"><div className="empty-mark">π</div><h2>今天想完成什么？</h2><p>{modelMode?'从一个目标开始，在同一会话中持续推进。':'无模型演示 · 体验真实文件操作、审批与成果。'}</p><div className="suggestions">{['整理本周工作记录','记录一次项目讨论','起草下一步行动清单'].map(text => <button key={text} disabled={!selected || !!unconfirmedRun} onClick={() => setDrafts(all => ({ ...all, [selected]: text }))}>{text}<span>↗</span></button>)}</div>{!selected && <p className="hint">先在左侧新建一个会话</p>}</div>}
            {thread && <RunHistory onRead={scroll.holdReading} api={api} scope={queryScope.current} thread={thread} pending={pending} workspacePath={workspacePath} mode={home?.mode} busy={busy} disconnected={disconnected} command={command} operationPages={pages?.operations} loading={pageBusy || toolsBusy} loadMore={runId => void loadPages(runId)} />}
            {unplacedApprovals.length > 0 && <section className="current-approvals" aria-label="当前待审批操作"><h3 className="run-section-title">当前任务等待确认 · 历史尚未载入</h3><ApprovalList pending={unplacedApprovals} workspacePath={workspacePath} modelMode={modelMode} busy={busy} disconnected={disconnected} command={command} /></section>}
          </div></div>
          {scroll.browsing && <button className="return-latest" onClick={scroll.returnLatest}>返回最新 ↓</button>}
          {!modelMode && !currentRuns.length && <details className="demo-options"><summary>命令演示</summary><div className="suggestions"><button disabled={!selected || !!unconfirmedRun || busy || disconnected} onClick={() => setDrafts(all => ({ ...all, [selected]: '/demo-shell' }))}>填入只读命令演示</button><button disabled={!selected || !!unconfirmedRun || busy || disconnected} onClick={() => setDrafts(all => ({ ...all, [selected]: '/demo-shell-wait' }))}>填入可停止命令演示</button></div></details>}<form className="composer" onSubmit={event => { event.preventDefault(); void submit(); }}>
            <label className="sr-only" htmlFor="composer">你的消息</label><textarea id="composer" placeholder={selected ? '描述你想完成的工作…' : '新建会话后，在这里描述你的目标…'} disabled={!selected || !!unconfirmedRun} value={draft} maxLength={16384} onChange={event => setDrafts(all => ({ ...all, [selected]: event.target.value }))} onKeyDown={event => { if (shouldSubmit(event.nativeEvent)) { event.preventDefault(); void submit(); } }} />
            <div className="composer-footer">{activity && <PermissionPicker key={`${selected}:${queryScope.current}`} thread={activity.thread} api={api} disabled={disconnected || !!unconfirmedRun} changed={() => setTick(n => n + 1)} pending={setPermissionPending} />}<span>{modelMode?(shellTools?'Pi · 文件与 Bash':home?.model?.limits?.fileTools?'Pi · 文件工具':'Pi · 无工具'):'无模型演示'}</span><button className="primary" type="submit" disabled={!selected || !draft.trim() || busy || disconnected || permissionPending || !activity || !canSend}>{unconfirmedRun ? '重试未确认请求' : isWorking ? '加入队列' : '发送'} <span>↑</span></button></div>
            {unconfirmedRun && <p role="status">尚未收到确认；重试会核对同一次提交，原内容已保留。</p>}
          </form><p className="composer-hint">Enter 发送 · Shift + Enter 换行</p>
        </section>
        {inspectorOpen && layout.overlay && <button className="inspector-backdrop" tabIndex={-1} aria-label="关闭详情" onClick={closeInspector} />}
        <div className="inspector-pane" hidden={!inspectorOpen} style={{width: layout.inspectorWidth}} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); closeInspector(); } }}>
        {inspectorOpen && <PaneResizeHandle label="详情栏宽度" controls="task-inspector" edge="left" width={layout.inspectorWidth} min={layout.inspectorMin} max={layout.inspectorMax} onResize={layout.resizeInspector} onReset={layout.resetInspector} />}
        <aside id="task-inspector" ref={inspectorRef} className="inspector" aria-label="成果与预览" hidden={!inspectorOpen}>
          <div className="inspector-nav"><h2>成果与预览</h2><button className="inspector-close" aria-label="关闭详情" onClick={closeInspector}>×</button></div>
          <section className="inspector-panel" aria-label="成果浏览">
            <ArtifactPanel key={`${selected}:${queryScope.current}`} thread={thread} api={api} disconnected={disconnected} hasMore={pages?.artifacts.hasMore ?? false} loading={pageBusy} loadMore={() => void loadPages('artifacts')} />
            <p className="inspector-foot">{shellTools?'Bash 成功不代表成果已登记；只有核验过的文件版本才列入这里。':'成果由宿主核验后登记，打开时重新检查文件。'}</p>
          </section>
        </aside>
        </div>
      </div>
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
