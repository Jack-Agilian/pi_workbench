import { CopyText } from './copy-text.tsx';
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DesktopApi, DesktopThread, Preview } from '../../packages/app-contracts/desktop.ts';

export const artifactBadge=(path:string)=>path.toLowerCase().endsWith('.md')?{text:'MD',label:'Markdown 文件'}:{text:'▤',label:'文件（按登记名称）'};
const statusLabels: Record<Preview['status'], string> = {
  ready: '内容与登记版本一致', changed: '当前内容与此登记版本不同', missing: '文件已不存在', unavailable: '无法安全读取',
};
/** Status is a host preview result at a point in time, never inferred from a successful command. */
export function ArtifactPanel({thread, api, disconnected, hasMore, loading, loadMore}: {hasMore: boolean; loading: boolean; loadMore: () => void; thread: DesktopThread | null; api: DesktopApi; disconnected: boolean}) {
  const [checks, setChecks] = useState<Record<string, {status: Preview['status']; at: string}>>({});
  const [preview, setPreview] = useState<{id: string; value?: Preview; error?: boolean} | null>(null);
  const generation = useRef(0);
  const buttons = useRef(new Map<string,HTMLButtonElement>());
  const previewRef = useRef<HTMLElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  useLayoutEffect(() => {
    if (!preview?.id) return;
    previewRef.current?.focus({preventScroll: true});
    previewRef.current?.scrollIntoView({block: 'nearest'});
  }, [preview?.id]);
  useEffect(() => () => { generation.current++; }, []);
  async function inspect(id: string) {
    const current = ++generation.current;
    setPreview({id});
    try {
      const value = await api.preview(id);
      if (generation.current !== current) return;
      setPreview({id, value});
      setChecks(all => ({...all, [id]: {status: value.status, at: new Date().toLocaleTimeString('zh-CN')}}));
    } catch {
      if (generation.current === current) setPreview({id, error: true});
    }
  }
  return <>
    <h3 className="artifacts-heading">成果版本 <span>{thread?.artifacts.length ?? 0}{hasMore ? '+' : ''}</span></h3>
    {!thread?.artifacts.length && <div className="artifact-empty"><span>▤</span><p>成果将在这里出现</p><small>只有核验过的真实文件才会登记。</small></div>}
    {thread?.artifacts.map(artifact => {
      const check = checks[artifact.id];
      const badge=artifactBadge(artifact.path);
      const versions=thread.artifacts.filter(item=>item.path===artifact.path).sort((a,b)=>b.version-a.version);
      const input = thread.inputs.find(item => item.id === artifact.runId)?.text;
      return <Fragment key={artifact.id}><button className={`artifact ${preview?.id === artifact.id ? 'selected-artifact' : ''}`} data-artifact={artifact.id} ref={node=>{if(node)buttons.current.set(artifact.id,node);else buttons.current.delete(artifact.id);}} disabled={disconnected} onClick={event => { opener.current = event.currentTarget; void inspect(artifact.id); }}>
        <span className="file-icon" role="img" aria-label={badge.label}>{badge.text}</span><div>
          <strong title={artifact.path}>{artifact.path.split('/').at(-1)}</strong>
          {artifact.path.includes('/') && <small className="artifact-path" title={artifact.path}>{artifact.path}</small>}
          <small title={input ? `来源：${input.slice(0, 160)}` : `来源执行 ${artifact.runId}`}>执行 {artifact.runId.slice(0, 8)} · 版本 {artifact.version} · {artifact.bytes} B</small>
          <small className="artifact-status" data-status={check?.status ?? 'unchecked'}>{check ? `上次核验 ${check.at} · ${statusLabels[check.status]}` : '当前状态未核验 · 点击检查'}</small>
        </div>
      </button>
    {preview?.id === artifact.id && <section className="preview" aria-label="成果预览" tabIndex={-1} ref={previewRef}><div><h3>{artifact.path.split('/').at(-1)} · 版本 {artifact.version}</h3><button aria-label="关闭预览" onClick={() => { generation.current++; setPreview(null); opener.current?.focus({preventScroll: true}); }}>×</button></div>
      <p className="preview-identity">{artifact.path} · 纯文本预览</p>
      <label className="artifact-version-picker">本会话已加载的同路径版本<select aria-label="选择成果版本" value={artifact.id} disabled={disconnected} onChange={event=>{const id=event.target.value;opener.current=buttons.current.get(id)??null;void inspect(id);}}>{versions.map(item=><option key={item.id} value={item.id}>版本 {item.version} · 执行 {item.runId.slice(0,8)}</option>)}</select></label>
      {hasMore&&<p className="run-note">版本列表尚未全部加载，可用下方“加载更多成果”继续查找。</p>}
      <details className="artifact-evidence"><summary>登记信息与核验范围</summary><p>SHA-256（登记文件原始字节）</p><code>{artifact.digest}</code><p>执行 {artifact.runId}<br/>操作 {artifact.operationId}</p><p>仅核对当前文件是否匹配该版本；没有保存历史文件副本。预览经过已知凭据格式过滤，复制的是上次核验时的展示文本，不能用其重新计算登记摘要。</p></details>
      {checks[artifact.id] && <p className="preview-check" role="status">上次核验 {checks[artifact.id]!.at} · {statusLabels[checks[artifact.id]!.status]}</p>}
      {preview.error ? <p role="status">核验请求未获确认，无法确定当前文件状态。</p> : !preview.value ? <p role="status">正在核验文件…</p> : preview.value.status === 'ready' ? <><p className="run-note">已知凭据格式已过滤 · 上次核验时的展示文本</p><CopyText text={preview.value.text??''} label="复制已核验预览" disabled={disconnected}/><pre>{preview.value.text}</pre></> : <p role="status">{preview.value.status === 'changed' ? '当前内容与此登记版本不同；历史记录保留，不展示不匹配的内容。' : preview.value.status === 'missing' ? '文件已不存在，历史成果记录仍保留。' : '当前无法安全读取此文件。'}</p>}
      <button disabled={disconnected || (!preview.value && !preview.error)} onClick={() => void inspect(preview.id)}>重新核验文件</button>
    </section>}
      </Fragment>;
    })}
    {hasMore && <button className="load-artifacts" disabled={loading || disconnected} onClick={loadMore}>{loading ? '正在加载…' : '加载更多成果'}</button>}

  </>;
}
