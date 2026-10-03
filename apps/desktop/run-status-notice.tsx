import { useEffect,useRef,useState } from 'react';
import type { RunState,RunView } from '../../packages/app-contracts/index.ts';
const terminal=new Set<RunState>(['completed','failed','cancelled']);
/** Only transitions actually observed in this mounted Thread/connection are announced.
 * Disappearance, Pi idle and old historical rows cannot invent a final outcome. */
export function RunStatusNotice({runs}:{runs:RunView[]}){
 const seen=useRef(new Map<string,RunState>());
 const [notice,setNotice]=useState<{id:string;state:RunState}|null>(null);
 useEffect(()=>{
  for(const run of runs){const before=seen.current.get(run.id);if(before&&!terminal.has(before)&&terminal.has(run.state))setNotice({id:run.id,state:run.state});seen.current.set(run.id,run.state);}
 },[runs]);
 return <div className="run-completion" aria-live="polite" aria-atomic="true" role="status">{notice&&<><span>{notice.state==='completed'?'任务已结束，请查看正文和操作结果。':notice.state==='failed'?'任务未完成，请查看失败说明。':'任务已停止并完成清理；已发生的改动保留。'}</span><button type="button" aria-label="关闭任务状态提示" onClick={()=>setNotice(null)}>×</button></>}</div>;
}
