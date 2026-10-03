import { useEffect, useRef, useState } from 'react';
import type { DesktopApi, DesktopThread, Preview } from '../../packages/app-contracts/desktop.ts';

const statusLabels: Record<Preview['status'], string> = {
  ready: '内容与登记版本一致', changed: '当前内容与此登记版本不同', missing: '文件已不存在', unavailable: '无法安全读取',
};
/** Status is a host preview result at a point in time, never inferred from a successful command. */
export function ArtifactPanel({thread, api, disconnected, hasMore, loading, loadMore}: {hasMore: boolean; loading: boolean; loadMore: () => void; thread: DesktopThread | null; api: DesktopApi; disconnected: boolean}) {
  const [checks, setChecks] = useState<Record<string, {status: Preview['status']; at: string}>>({});
  const [preview, setPreview] = useState<{id: string; value?: Preview; error?: boolean} | null>(null);
  const generation = useRef(0);
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
    <h3 className="artifacts-heading">成果文件 <span>{thread?.artifacts.length ?? 0}</span></h3>
    {!thread?.artifacts.length && <div className="artifact-empty"><span>▤</span><p>成果将在这里出现</p><small>只有核验过的真实文件才会登记。</small></div>}
    {thread?.artifacts.map(artifact => {
      const check = checks[artifact.id];
      const input = thread.inputs.find(item => item.id === artifact.runId)?.text;
      return <button className={`artifact ${preview?.id === artifact.id ? 'selected-artifact' : ''}`} key={artifact.id} data-artifact={artifact.id} disabled={disconnected} onClick={() => void inspect(artifact.id)}>
        <span className="file-icon">M↓</span><div>
          <strong title={artifact.path}>{artifact.path.split('/').at(-1)}</strong>
          <small className="artifact-path">{artifact.path}</small>
          <small>来源：{input ? input.slice(0, 80) : `执行 ${artifact.runId.slice(0, 8)}`}</small>
          <small title={`来源执行 ${artifact.runId}`}>执行 {artifact.runId.slice(0, 8)} · 版本 {artifact.version} · {artifact.bytes} B</small>
          <small className="artifact-status" data-status={check?.status ?? 'unchecked'}>{check ? `上次核验 ${check.at} · ${statusLabels[check.status]}` : '当前状态未核验 · 点击检查'}</small>
        </div>
      </button>;
    })}
    {hasMore && <button className="load-artifacts" disabled={loading || disconnected} onClick={loadMore}>{loading ? '正在加载…' : '加载更多成果'}</button>}
    {preview && <section className="preview" aria-label="成果预览"><div><h3>纯文本预览</h3><button aria-label="关闭预览" onClick={() => { generation.current++; setPreview(null); }}>×</button></div>
      {preview.error ? <p role="status">核验请求未获确认，无法确定当前文件状态。</p> : !preview.value ? <p role="status">正在核验文件…</p> : preview.value.status === 'ready' ? <pre>{preview.value.text}</pre> : <p role="status">{preview.value.status === 'changed' ? '当前内容与此登记版本不同；历史记录保留，不展示不匹配的内容。' : preview.value.status === 'missing' ? '文件已不存在，历史成果记录仍保留。' : '当前无法安全读取此文件。'}</p>}
      <button disabled={disconnected || (!preview.value && !preview.error)} onClick={() => void inspect(preview.id)}>重新核验文件</button>
    </section>}
  </>;
}
