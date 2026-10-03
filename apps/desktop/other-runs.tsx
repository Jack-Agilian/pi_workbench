import type { Command, RunState } from '../../packages/app-contracts/index.ts';
import type { DesktopHome } from '../../packages/app-contracts/desktop.ts';
const labels:Partial<Record<RunState,string>>={running:'执行中',starting:'正在启动',cancelling:'正在停止 · 等待清理',unknown:'结果待核实'};
/** M0's host active snapshot excludes queued Runs and has one execution owner.
 * It stays independent of directory filters/pages; no inferred approval or cleanup. */
export function OtherRuns({home,selected,disabled,select,command}:{home:DesktopHome|null;selected:string;disabled:boolean;select:(threadId:string)=>void;command:(value:Command)=>Promise<unknown>}) {
 const run=home?.activeRuns.find(item=>item.threadId!==selected);
 if(!run)return null;
 const name=home?.threads.find(thread=>thread.id===run.threadId)?.title??`会话 ${run.threadId.slice(0,8)}`;
 return <section className="other-runs" aria-label="其他会话的执行任务" data-other-run={run.id}>
  <div className="other-run-identity"><strong title={name}>{name}</strong><span role="status">其他会话 · {labels[run.state]??'状态待核实'}{disabled?' · 操作暂不可用':''}</span></div>
  <button className="show-other-run" type="button" onClick={()=>select(run.threadId)}>查看任务</button>
  {['starting','running'].includes(run.state)&&<button className="stop-other-run" type="button" disabled={disabled} aria-label={`停止其他任务 ${run.id}`} onClick={()=>void command({type:'runs.cancel',requestId:crypto.randomUUID(),runId:run.id})}>停止任务</button>}
 </section>;
}
