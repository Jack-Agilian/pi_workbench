import { useEffect, useState } from 'react';
import type { Command, OperationView } from '../../packages/app-contracts/index.ts';
import { ActionPanel } from './action-panel.tsx';
type Props={pending:OperationView[];workspacePath:string;modelMode:boolean;busy:boolean;disconnected:boolean;command:(value:Command)=>Promise<unknown>};
/** Only the independent activity snapshot supplies actionable approvals. History is read-only. */
export function ApprovalList(props:Props) {
  const first=props.pending[0];
  return first?<ApprovalCard key={first.id} {...props} op={first}/>:null;
}
function ApprovalCard({op,pending,workspacePath,modelMode,busy,disconnected,command}:Props&{op:OperationView}) {
  const [details,setDetails]=useState(false),[now,setNow]=useState(Date.now);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const expired=now>=op.deadline;
  const title=op.shell?'允许执行命令？':op.tool==='read'?'允许读取文件？':op.tool==='edit'?'允许修改文件？':op.file?.fileVersion?'允许替换文件？':'允许创建文件？';
  const decide=(decision:'allow'|'deny')=>{
    if(busy||disconnected||Date.now()>=op.deadline)return;
    void command({type:'approvals.resolve',requestId:crypto.randomUUID(),operationId:op.id,parametersDigest:op.parametersDigest,decision});
  };
  return <section className="approval" data-approval={op.id} tabIndex={-1} aria-label={op.shell?'命令执行审批':op.tool==='read'?'文件读取审批':'文件写入审批'}>
    <header><h3 className="approval-label">{title}</h3>{pending.length>1&&<span className="approval-count">还有 {pending.length-1} 项待确认</span>}</header>
    <pre className="target">{op.shell?op.shell.intent.command:op.artifactPath}</pre>
    <p className="approval-risk">{op.shell?'可能修改或删除文件，停止不回滚。':op.tool==='read'?'读取目标文件内容。':op.file?.fileVersion?'修改已有文件，停止不回滚。':'新建文件，不覆盖已有内容。'}{modelMode&&'工具结果会发送给模型。'}</p>
    {(expired||disconnected)&&<p className="approval-unavailable" role="status">{expired?'审批已过期，等待宿主更新。':'连接断开，暂不能作出决定。'}</p>}
    <footer><button className="approval-evidence" type="button" onClick={()=>setDetails(true)}>查看{op.shell?'命令详情':'内容与范围'}</button><small className="approval-deadline">截至 {new Date(op.deadline).toLocaleTimeString('zh-CN')}</small><div className="approval-actions">
      <button type="button" disabled={busy||disconnected||expired} onClick={()=>decide('deny')}>拒绝</button>
      <button type="button" className="primary" disabled={busy||disconnected||expired} onClick={()=>decide('allow')}>仅本次允许</button>
    </div></footer>
    {details&&<ActionPanel approvalId={op.id} title="操作详情" close={()=>setDetails(false)}><pre className="target">{op.shell?op.shell.intent.command:op.artifactPath}</pre><p className="approval-workspace">工作目录：{workspacePath}</p>
      {op.file&&<section className="file-change"><p>{op.file.summary} · 版本 {op.file.fileVersion?.slice(0,12)??'尚不存在'}</p><pre>{op.file.preview}</pre><small>安全摘要；超长内容截断。</small></section>}
      <section className="approval-meta"><h3>权限与校验信息</h3><p>Pi {op.tool} · 仅此任务 · 一次执行</p>
      {op.shell&&<p>{op.shell.intent.profile} · {op.shell.intent.profile==='restricted-bash-v1'?'禁网、限定工作目录':'允许联网及目录外操作'} · 隔离环境 · {op.shell.intent.timeoutMs===null?'无命令独立超时':`${op.shell.intent.timeoutMs/1000} 秒超时`}</p>}
      <p>参数摘要</p><code>{op.parametersDigest}</code><p>{op.shell?'许可绑定当前任务、命令、目录、执行配置和期限。':'许可绑定当前任务与文件版本；目标变化后失效。'}</p><p>批准截止 {new Date(op.deadline).toLocaleString('zh-CN')}</p></section>
    </ActionPanel>}
  </section>;
}
