import { useEffect, useRef, useState } from 'react';
import type { Command, PermissionMode, ThreadView } from '../../packages/app-contracts/index.ts';
import type { DesktopApi } from '../../packages/app-contracts/desktop.ts';

/** Host-owned policy. A local selection never grants a tool or changes a running task. */
export function PermissionPicker({thread, api, disabled, changed, pending}: {
  thread: ThreadView; api: DesktopApi; disabled: boolean; changed: () => void; pending: (value: boolean) => void;
}) {
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
      if (alive.current) { setIntent(null); changed(); }
    } catch (error) {
      if (alive.current) {
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
  return <details className="permission-picker">
    <summary>权限：{mode === 'auto' ? '自动审批' : '人工审批'}{saving ? ' · 保存中' : ''}</summary>
    <div className="permission-options">
      <p>仅影响之后发送的任务，已接收或排队的任务保留原模式。</p>
      <button type="button" data-permission="manual" aria-pressed={mode === 'manual'} disabled={disabled || saving || !!intent} onClick={() => void save('manual')}>人工审批 <small>每次工具操作执行前询问。</small></button>
      <button type="button" data-permission="auto" aria-pressed={mode === 'auto'} disabled={disabled || saving || !!intent} onClick={() => void save('auto')}>自动审批 <small>自动允许工作目录内已启用的文件与 Bash 工具，可能修改或删除文件。Bash 网络仍受限。</small></button>
      <p>完全访问尚未提供。自动审批不会扩大文件、网络或凭据访问范围。</p>
      {problem && <p role="alert">{problem}</p>}
      {intent && !saving && <button type="button" className="retry-permission" disabled={disabled} onClick={() => void save(intent.mode)}>重试权限设置</button>}
    </div>
  </details>;
}
