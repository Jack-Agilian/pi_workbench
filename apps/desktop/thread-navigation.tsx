import { useLayoutEffect, useRef, useState } from 'react';
import type { Command, ThreadView } from '../../packages/app-contracts/index.ts';
import type { DesktopApi } from '../../packages/app-contracts/desktop.ts';
import { shouldSubmit } from './composer-key.ts';

type Rename = Extract<Command, {type: 'threads.rename'}>;
/** Product title only; never sends a prompt or edits a Pi Session. Stable row identity
 * keeps an unconfirmed request when selecting another chat or reconnecting the host. */
export function ThreadNavigation({thread, workspace, active, selected, select, api, scope, disconnected, changed}: {
  thread: ThreadView; workspace?: string; active: boolean; selected: boolean; select: () => void;
  api: DesktopApi; scope: string; disconnected: boolean; changed: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [revision, setRevision] = useState(thread.titleRevision);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState('');
  const [conflict, setConflict] = useState(false);
  const intent = useRef<Rename | null>(null);
  const restoreOpener = useRef(false);
  const generation = useRef(0), inFlight = useRef(false);
  const opener = useRef<HTMLButtonElement>(null), input = useRef<HTMLInputElement>(null), form = useRef<HTMLFormElement>(null);
  useLayoutEffect(() => {
    generation.current++; inFlight.current = false; setSaving(false);
    if (intent.current) setProblem('改名尚未确认，可重试同一次请求。');
    return () => { generation.current++; inFlight.current = false; };
  }, [scope]);
  useLayoutEffect(() => {
    if (editing) { input.current?.focus(); input.current?.select(); }
    else if (restoreOpener.current) { restoreOpener.current = false; opener.current?.focus(); }
  }, [editing]);
  function open() { setDraft(thread.title); setRevision(thread.titleRevision); setConflict(false); setProblem(''); setEditing(true); }
  function cancel() { if (inFlight.current || intent.current) return; restoreOpener.current = true; setEditing(false); }
  async function save() {
    if (disconnected || inFlight.current || conflict || !draft.trim()) return;
    const command = intent.current ?? {type:'threads.rename', requestId:crypto.randomUUID(), threadId:thread.id, title:draft.trim(), expectedRevision:revision};
    intent.current = command; inFlight.current = true; setSaving(true); setProblem('');
    const current = ++generation.current;
    try {
      await api.command(command);
      if (generation.current !== current) return;
      restoreOpener.current = form.current?.contains(document.activeElement) ?? false;
      intent.current = null; setEditing(false); changed();
    } catch (error) {
      if (generation.current !== current) return;
      if (error instanceof Error && error.message === 'title_changed') {
        intent.current = null; setConflict(true); setProblem('名称已被其他操作修改。输入已保留，请核对最新名称后再保存。'); changed();
      } else if (error instanceof Error && error.message === 'invalid_title') {
        intent.current = null; setProblem('名称需为1–160个字符，不能包含换行或控制字符。');
      } else setProblem('改名尚未确认，可重试同一次请求。');
    } finally { if (generation.current === current) { inFlight.current = false; setSaving(false); } }
  }
  return <div className="thread-row" data-thread={thread.id}>
    <button aria-label={thread.title} className={`thread-link ${selected ? 'selected' : ''}`} aria-current={selected ? 'page' : undefined} onClick={select}>
      <span className="thread-identity"><span title={thread.title}>{thread.title}</span><small title={workspace}>{workspace?.split('/').at(-1) ?? '工作目录'}</small></span>
      <small className="thread-short-id">{thread.id.slice(0,6)}</small>{active && <span className="activity-dot" aria-label="有活动任务" />}
    </button>
    <button className="rename-thread" ref={opener} aria-label={`重命名会话：${thread.title}`} title="重命名会话" disabled={disconnected || editing} onClick={open}>✎</button>
    {editing && <form className="rename-form" ref={form} onSubmit={event => {event.preventDefault(); void save();}} onKeyDown={event => {
      if (event.key === 'Escape') {event.preventDefault(); cancel();}
      if (event.key === 'Enter' && !shouldSubmit(event.nativeEvent)) event.preventDefault();
    }}>
      <label htmlFor={`rename-${thread.id}`}>会话名称</label>
      <input id={`rename-${thread.id}`} ref={input} maxLength={160} value={draft} disabled={saving || !!intent.current} onChange={event => setDraft(event.target.value)} />
      {problem && <p role="status">{problem}</p>}
      {conflict && <><p>最新名称：{thread.title}</p><button type="button" disabled={disconnected || thread.titleRevision === revision} onClick={() => {setRevision(thread.titleRevision); setConflict(false); setProblem('已采用最新版本，请确认输入后保存。');}}>采用最新版本，保留输入</button></>}
      <div><button className="save-title" type="submit" disabled={disconnected || saving || conflict || !draft.trim()}>{saving ? '保存中…' : intent.current ? '重试改名' : '保存名称'}</button>
      <button type="button" className="cancel-title" disabled={saving || !!intent.current} onClick={cancel}>取消</button></div>
    </form>}
  </div>;
}
