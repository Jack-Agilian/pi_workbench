import { UiIcon } from './ui-icon.tsx';
import { useEffect, useRef, useState } from 'react';
import { ActionPanel } from './action-panel.tsx';
import type { Command, PermissionMode, ThreadView } from '../../packages/app-contracts/index.ts';
import type { DesktopApi } from '../../packages/app-contracts/desktop.ts';

/** Host-owned policy. A local selection never grants a tool or changes a running task. */
export function PermissionPicker({thread, api, disabled, changed, pending}: {
  thread: ThreadView; api: DesktopApi; disabled: boolean; changed: () => void; pending: (value: boolean) => void;
}) {
  const [open,setOpen]=useState(false),[tipHidden,setTipHidden]=useState(false);
  const trigger=useRef<HTMLButtonElement>(null);
  const [intent, setIntent] = useState<Extract<Command, {type: 'threads.permissions'}> | null>(null);
  const [problem, setProblem] = useState('');
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; pending(false); }; }, []);
  async function save(mode: PermissionMode) {
    if (disabled || inFlight.current) return;
    const command = intent ?? {type: 'threads.permissions', requestId: crypto.randomUUID(), threadId: thread.id, mode, expectedRevision: thread.permissionRevision ?? 0};
    let resolved = false;
    inFlight.current = true; setSaving(true); pending(true); setProblem(''); setIntent(command);
    try {
      await api.command(command); resolved = true;
      if (alive.current) { setIntent(null); setOpen(false); changed(); }
    } catch (error) {
      if (alive.current) {
        setOpen(false); // Keep retry reachable outside the modal after an unconfirmed save.
        if (error instanceof Error && error.message === 'permission_changed') {
          resolved = true; setIntent(null); setProblem('权限设置已变化，请刷新后重新选择。'); changed();
        } else setProblem('设置未获确认。可重试同一次设置；不要据此认为权限已经改变。');
      }
    } finally {
      inFlight.current = false;
      if (alive.current) { setSaving(false); pending(!resolved); }
    }
  }
  const mode = thread.permissionMode ?? 'manual';
  return <div className="permission-picker">
    <button ref={trigger} className="permission-trigger" data-tip-hidden={tipHidden} onMouseEnter={()=>setTipHidden(false)} onFocus={()=>setTipHidden(false)} onKeyDown={e=>{if(e.key==='Escape')setTipHidden(true);}} type="button" data-tip="更改权限" aria-label={`更改权限，当前${mode==='full'?'完全访问':mode==='auto'?'自动审批':'人工审批'}`} aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}>{mode === 'full' ? '完全访问' : mode === 'auto' ? '自动审批' : '人工审批'}<UiIcon name="chevron"/></button>
    {open&&<ActionPanel title="更改权限" anchor={trigger.current} close={()=>setOpen(false)}><div className="permission-options">
      <p>仅影响之后发送的任务，已接收或排队的任务保留原模式。</p>
      <button type="button" data-permission="manual" aria-pressed={mode === 'manual'} disabled={disabled || saving || !!intent} onClick={() => void save('manual')}>人工审批 <small>每次工具操作执行前询问。</small></button>
      <button type="button" data-permission="auto" aria-pressed={mode === 'auto'} disabled={disabled || saving || !!intent} onClick={() => void save('auto')}>自动审批 <small>自动允许工作目录内已启用的文件与 Bash 工具，可能修改或删除文件。Bash 网络仍受限。</small></button>
      <button type="button" data-permission="full" aria-pressed={mode === 'full'} disabled={disabled || saving || !!intent} onClick={() => void save('full')}>完全访问 <small>自动允许已启用的工具访问工作目录外文件及 Bash 联网，可能修改或删除文件。应用私有数据和运行时代码仍受保护，工具结果可能发送给模型。</small></button>
    </div></ActionPanel>}
    {(saving||problem)&&<p className="permission-feedback" role="status">{saving?'正在保存权限…':problem}</p>}
      {intent && !saving && <button type="button" className="retry-permission" disabled={disabled} onClick={() => void save(intent.mode)}>重试权限设置</button>}
  </div>;
}
