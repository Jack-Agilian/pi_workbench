// Design-only synthetic states. No product bridge, provider, filesystem or fetch.
const $ = id => document.getElementById(id);
const escapeText = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths = {
  plus:'M8 3v10M3 8h10',search:'M7 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8m3-1 3 3',
  folder:'M2 4h4l1.5 2H14v7H2z',chevron:'m5 6 3 3 3-3',close:'m4 4 8 8M12 4l-8 8',
  sidebar:'M2 2h12v12H2zM6 2v12',file:'M4 1h5l3 3v11H4zM9 1v4h3',more:'M3 8h.01M8 8h.01M13 8h.01',
  filter:'M2 4h12M4 8h8M6 12h4',stop:'M4 4h8v8H4z',up:'M8 13V3m-4 4 4-4 4 4',down:'M8 3v10m-4-4 4 4 4-4',
  copy:'M6 5h7v9H6zM10 5V2H3v9h3',clock:'M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0M8 4v4l3 2',
  check:'m3 8 3 3 7-7',arrow:'M3 8h10m-4-4 4 4-4 4',read:'M2 3h5l1 1 1-1h5v10H9l-1 1-1-1H2zM8 4v10',
  terminal:'m3 5 3 3-3 3M8 11h5',shield:'M8 1 2 3v5c0 3 6 7 6 7s6-4 6-7V3z',info:'M8 7v5M8 4h.01M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0'
};
const icon = name => `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${paths[name] || paths.file}"/></svg>`;
document.querySelectorAll('[data-icon]').forEach(el => {el.innerHTML=icon(el.dataset.icon);});
for (const [id,name] of Object.entries({'filter':'filter','nav-toggle':'sidebar','documents-toggle':'file','context':'more','close-document':'close','close-panel':'close','doc-copy':'copy','doc-details':'clock'})) $(id).innerHTML=icon(name);
document.querySelector('.nav-close').innerHTML=icon('close');

const directories=[{name:'研究项目',path:'示例工作区 / 团队研究 / 研究项目'},{name:'研究项目',path:'示例工作区 / 历史归档 / 研究项目'}];
const names={manual:'人工审批',auto:'自动审批',full:'完全访问'};
const descriptions={manual:'每次工具操作执行前询问。',auto:'自动允许工作目录内已启用的工具，可能修改或删除文件；Bash 网络仍受限。',full:'允许已启用的工具访问目录外文件及网络，可能修改或删除文件。应用私有数据仍受保护。'};
const initialInput='阅读访谈资料，整理出客户最关心的三个问题，并生成一份适合团队讨论的 Markdown 总结。';
const docs=[{name:'秋季客户访谈总结.md',title:'秋季客户访谈总结',path:'报告 / 秋季客户访谈总结.md'}, {name:'访谈后续行动.md',title:'访谈后续行动',path:'报告 / 访谈后续行动.md'}];
const mainDocument=`<h1>秋季客户访谈总结</h1><p class="lede">团队讨论稿 · 2026 年 10 月<br>基于合成的访谈资料，仅用于界面设计</p><p>客户希望减少重复操作，也希望在自动化过程中保持对关键决定的掌控。以下三个问题值得优先讨论。</p><h2>01　让进度一目了然</h2><p>用户需要知道任务正在处理什么、是否需要自己介入，以及什么时候可以检查结果。正常执行可以安静，遇到阻碍应及时说明。</p><blockquote>“我不需要每一步都盯着，但需要知道什么时候该看一眼。”</blockquote><h2>02　减少重复确认</h2><p>相同场景反复出现长说明会削弱注意力。应把关键变化放在决定附近，把可追溯的技术信息留在详情中。</p><h2>03　成果要容易找到</h2><p>任务完成后，文档应与产生它的对话关联。打开文件后，正文应占据主要空间，用户仍然知道如何回到会话。</p><h2>建议的下一步</h2><ul><li>用一次完整工作流程验证导航和结果可发现性。</li><li>检查待审批、失败与断线时的恢复入口。</li><li>邀请同事阅读文档，记录实际疑惑。</li></ul><table><thead><tr><th>议题</th><th>负责人</th><th>产出</th></tr></thead><tbody><tr><td>流程复核</td><td>产品团队</td><td>状态样例</td></tr><tr><td>可读性</td><td>设计团队</td><td>阅读反馈</td></tr></tbody></table><p class="lede">样例内容到此结束。文档中的事实与人员均为合成。</p>`;
let threads, currentId, targetDirectory=0, filtered=false, panelOpener=null, toastTimer;
let navOpen=innerWidth>=760, navWidth=232, docWidth=440;
const current=()=>threads.find(t=>t.id===currentId);
const active=t=>['running','approval','cancelling'].includes(t.phase);
function makeThread(id,title,directory=0){return {id,title,directory,draft:'',phase:'complete',input:initialInput,mode:'manual',runMode:'manual',pendingMode:null,queue:[],hasDoc:true,docOpen:false,docId:0,docDismissed:false,firstDocSeen:true,newVersion:false,scroll:0,docScroll:0};}
function reset(scenario=$('scenario').value){
  clearTimeout(toastTimer);$('toast').hidden=true;
  threads=[makeThread('research','整理秋季客户访谈'),makeThread('plan','梳理下一阶段交付计划'),makeThread('archive','整理秋季客户访谈',1),makeThread('notes','把会议记录变成行动清单')];
  currentId='research'; filtered=false; $('search').value='';
  const t=current();t.docOpen=['complete','changed','long'].includes(scenario);
  if(scenario==='empty'){t.phase='empty';t.title='新会话';t.hasDoc=false;t.firstDocSeen=false;}
  if(['approval','running','disconnected','unknown'].includes(scenario)){t.phase=scenario;t.hasDoc=false;t.firstDocSeen=false;}
  if(scenario==='permission-error'){t.pendingMode='auto';t.docOpen=false;}
  if(scenario==='changed')t.phase='changed';
  if(scenario==='long'){t.title='整理秋季客户访谈：跨部门协作与长周期交付中的关键发现及下一阶段计划';t.long=true;}
  navOpen=innerWidth>=760; render();
}
function remember(){const t=current();t.draft=$('draft').value;t.scroll=$('timeline').scrollTop;t.docScroll=$('doc-scroll').scrollTop;}
function renderNavigation(){
  const search=$('search').value.trim();
  const matches=threads.filter(t=>(!filtered||t.directory===0)&&(!search||t.title.includes(search)||directories[t.directory].path.includes(search)));
  $('thread-list').innerHTML=matches.map(t=>`<button type="button" class="thread-row ${t.id===currentId?'selected':''} ${active(t)?'active':''}" data-thread="${t.id}" ${t.id===currentId?'aria-current="true"':''}><strong>${escapeText(t.title)}</strong>${t.directory===1?'<small>历史归档 / 研究项目</small>':''}${active(t)?'<span class="dot" aria-label="有任务正在处理"></span>':''}</button>`).join('');
  $('no-results').hidden=!!matches.length;$('filter-status').hidden=!filtered;
}
function tools(expanded=false){return `<details class="tool-group" ${expanded?'open':''}><summary>操作记录 · ${current().hasDoc?'3 项':'2 项'}</summary><div class="tool-row">${icon('read')}<span class="target">读取访谈资料<br><span class="muted">访谈 / 客户访谈摘录.md</span></span><small>已读取</small></div><div class="tool-row">${icon('read')}<span class="target">读取研究背景<br><span class="muted">研究说明.md</span></span><small>已读取</small></div>${current().hasDoc?`<div class="tool-row">${icon('file')}<span class="target">写入秋季客户访谈总结.md</span><small>已核实</small></div>`:''}<p class="read-note">操作记录独立展示，不表示与正文的先后关系。</p></details>`;}
function approval(){return `<section class="approval" aria-label="等待批准的文件操作"><div class="approval-label">${icon('shield')}允许创建文件？</div><div class="file-target">研究项目 / 报告 / 秋季客户访谈总结.md</div><p>新建文件，不覆盖已有内容。仅允许此项已确认的操作。</p><div class="approval-actions"><button class="evidence-link" data-action="approval-evidence" type="button">查看写入内容</button><span class="spacer"></span><button class="secondary" data-action="deny" type="button">拒绝</button><button class="primary" data-action="approve" type="button">仅本次允许</button></div></section>`;}

function renderMessages(){
  const t=current();
  if(t.phase==='empty'){$('messages').innerHTML=`<div class="empty"><div class="empty-mark">π</div><h1>在这个项目中开始工作</h1><p>描述目标、提供背景，或说明希望得到的文档。</p><button type="button" data-action="directory">${icon('folder')}${escapeText(directories[t.directory].name)} ${icon('chevron')}</button></div>`;return;}
  let content=`<div class="user-message">${escapeText(t.input)}</div>`;
  if(['complete','changed'].includes(t.phase)){
    content+=`<div class="assistant-text"><p>已整理好访谈总结。三个反复出现的问题是：</p><ul><li><strong>进度透明</strong>：清楚知道当前进展，以及何时需要介入。</li><li><strong>减少重复确认</strong>：让注意力留给真正需要判断的变化。</li><li><strong>成果可发现</strong>：从对话直接打开文档，继续阅读和讨论。</li></ul><p>文档包含访谈归纳和下一步建议，可以从这里打开。</p>${t.long?'<h2>补充说明</h2>'+Array.from({length:12},(_,i)=>`<p>第 ${i+1} 组观察：当用户在回看旧记录时，新内容不应把阅读位置拉回底部。长段落在改变栏宽后仍应保留可辨认的上下文。</p>`).join(''):''}</div>${tools()}<button type="button" class="doc-chip" data-action="open-doc"><span class="doc-badge">MD</span><span class="file-label"><strong>秋季客户访谈总结.md</strong><small>报告 / Markdown 文档</small></span>${icon('arrow')}</button><div class="message-actions"><button class="icon" data-action="copy-answer" aria-label="复制展示回答" title="复制展示回答" type="button">${icon('copy')}</button></div>`;
  }else if(['approval','running','cancelling'].includes(t.phase)){
    content+=`<div class="assistant-text"><p>我会归纳访谈中反复出现的问题，整理成一份方便团队讨论的文档。</p></div>${tools()}${t.phase==='approval'?'<div class="activity">等待你的批准 · 请在输入区处理</div>':`<div class="activity"><span class="dot"></span>${t.phase==='cancelling'?'停止请求已接受，等待执行与清理结束…':'正在整理文档…'}</div>`}`;
  }else {
    const outcomes={denied:['已拒绝这次写入','目标文件未创建。你可以调整要求，再发送下一条任务。'],cancelled:['任务已停止','合成宿主已确认执行与清理结束；已发生的文件改动不会自动回滚。'],unknown:['执行结果尚未确认','先检查原任务的结果，再继续工作；不会自动重复写入。'],disconnected:['连接已中断','已收到的记录仍可阅读，当前执行结果尚不确定。']};
    const o=outcomes[t.phase]||outcomes.unknown;content+=`<div class="outcome"><strong>${o[0]}</strong>${o[1]}</div>${tools()}`;
  }
  $('messages').innerHTML=content;
}
function renderDocumentNotice(){
  const t=current();
  const pendingOverlay=t.phase==='approval'&&innerWidth-(navOpen&&innerWidth>=760?navWidth:0)-docWidth<448;
  $('doc-notice').hidden=!(t.phase==='changed'||t.newVersion||pendingOverlay);
  $('doc-notice').innerHTML=t.phase==='changed'?'文件内容已改变，当前无法展示登记版本。<button type="button" data-action="recheck">重新检查</button>':'有新登记版本。当前阅读保持不变。<button type="button" data-action="new-version">查看新版本</button>';
  if(pendingOverlay)$('doc-notice').innerHTML='输入区有一项操作等待你的决定。<button type="button" data-action="return-approval">返回处理审批</button>';
}
function renderDocument(){
  const t=current(); $('document-name').textContent=docs[t.docId].name;
  renderDocumentNotice();
  $('doc-copy').disabled=!t.hasDoc||t.phase==='changed';
  if(!t.hasDoc){$('document-body').innerHTML='<div class="doc-empty">这个会话还没有文档。</div>';return;}
  if(t.phase==='changed'){$('document-body').innerHTML='<div class="doc-empty"><p>当前文件与登记内容不同</p><p>历史记录仍保留，但没有历史文件副本。<br>不会用当前内容冒充旧版本。</p></div>';return;}
  $('document-body').innerHTML=t.docId===0?mainDocument:'<h1>访谈后续行动</h1><p class="lede">合成设计内容</p><h2>团队复核</h2><p>安排一次完整工作流程检查，记录遇到的问题。</p><h2>阅读反馈</h2><p>收集对文档结构和关键结论的意见。</p>';
}
function renderNotice(){
  const t=current();const other=threads.find(x=>x.id!==t.id&&active(x));
  let html='';
  if(t.phase==='disconnected')html='<div><strong>与工作台的连接已中断</strong><small>重新连接可能结束旧宿主尚未完成的任务。</small></div><button type="button" data-action="reconnect">重新连接</button>';
  else if(t.phase==='unknown')html='<div><strong>上次任务的结果待核实</strong><small>检查已有文件与执行记录，不重新运行操作。</small></div><button type="button" data-action="recover">检查执行结果</button>';
  else if(other)html=`<div><strong>另一会话正在处理任务</strong><small>${escapeText(other.title)}</small></div><button type="button" data-action="return-active">返回任务</button><button type="button" data-action="stop-other">停止</button>`;
  $('notice').innerHTML=html;$('notice').hidden=!html;
}
function syncControls(){
  const t=current();const blocked=!!t.pendingMode||['disconnected','unknown','cancelling'].includes(t.phase);
  $('permission-value').textContent=names[t.mode];$('permission-warning').hidden=!t.pendingMode;
  $('permission').disabled=['disconnected','unknown'].includes(t.phase);$('send').disabled=blocked||!$('draft').value.trim();
  const label=active(t)?'加入队列':'发送任务';$('send').setAttribute('aria-label',label);$('send').title=label+' · Enter';
  $('stop').hidden=!active(t);$('stop').disabled=t.phase==='cancelling';$('stop').innerHTML=icon('stop')+(t.phase==='cancelling'?'正在停止':'停止');
  $('approval-dock').hidden=t.phase!=='approval';$('approval-dock').innerHTML=t.phase==='approval'?approval():'';
  $('composer-hint').hidden=!(blocked||active(t));
  $('composer-hint').textContent=t.pendingMode?'核对权限设置后再发送；当前已确认的模式保持不变。':t.phase==='disconnected'?'连接恢复前不能发送；你的草稿已保留。':t.phase==='unknown'?'核实上次任务后再继续。':t.phase==='cancelling'?'正在等待任务与清理结束。':'新消息将加入队列，在当前任务结束后执行。';
  $('queue').hidden=!t.queue.length;$('queue').innerHTML=t.queue.length?`<span>等待执行 · ${escapeText(t.queue[0])}${t.queue.length>1?`（共 ${t.queue.length} 条）`:''}</span><button type="button" data-action="cancel-queue">取消首条</button>`:'';
}
function layout(){
  const narrow=innerWidth<760;const t=current();
  const overlay=innerWidth-(navOpen&&!narrow?navWidth:0)-docWidth<448;
  $('shell').classList.toggle('nav-hidden',!navOpen);$('shell').style.setProperty('--nav-width',navWidth+'px');$('shell').style.setProperty('--doc-width',docWidth+'px');
  $('content').classList.toggle('doc-overlay',overlay);$('content').classList.toggle('doc-hidden',!t.docOpen);
  $('chat').inert=t.docOpen&&overlay;$('workspace').inert=narrow&&navOpen;
  $('nav-scrim').hidden=!(narrow&&navOpen);$('nav-toggle').setAttribute('aria-expanded',String(navOpen));$('documents-toggle').setAttribute('aria-expanded',String(t.docOpen));
  $('nav-resize').setAttribute('aria-valuenow',String(navWidth));$('doc-resize').setAttribute('aria-valuenow',String(docWidth));
  renderDocumentNotice();
  if($('chat').inert&&$('chat').contains(document.activeElement))$('close-document').focus();
}
function render(){
  const t=current();$('rename').textContent=t.title;$('workspace-name').textContent=directories[t.directory].name;$('draft').value=t.draft;
  renderNavigation();renderMessages();renderDocument();renderNotice();syncControls();layout();
  $('timeline').scrollTop=t.scroll;$('doc-scroll').scrollTop=t.docScroll;
}
function toast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,2600);}
function openPanel(title,html,opener){
  panelOpener=opener||document.activeElement;const panel=$('panel');
  $('panel-title').textContent=title;$('panel-body').innerHTML=html;
  const anchored=['permission','document-picker','doc-details','context','thread-info','model'].includes(panelOpener?.id);
  panel.classList.toggle('anchored',anchored);panel.style.margin='auto';panel.style.left='';panel.style.top='';
  panel.showModal();
  if(anchored){const r=panelOpener.getBoundingClientRect();const h=panel.offsetHeight;panel.style.margin='0';panel.style.left=Math.max(12,Math.min(r.left,innerWidth-panel.offsetWidth-12))+'px';panel.style.top=Math.max(12,Math.min(r.top>h+12?r.top-h-8:r.bottom+8,innerHeight-h-12))+'px';}
}
function closePanel(){if(!$('panel').open)return;$('panel').close();if(panelOpener?.isConnected&&!panelOpener.closest('[inert]'))panelOpener.focus();}
function openDocument(manual=true){remember();const t=current();t.docOpen=true;if(manual)t.docDismissed=false;renderDocument();layout();$('documents').classList.remove('reveal');void $('documents').offsetWidth;$('documents').classList.add('reveal');if(manual)$('close-document').focus();}
function closeDocument(){const t=current();t.docScroll=$('doc-scroll').scrollTop;t.docOpen=false;t.docDismissed=true;layout();const chip=document.querySelector('[data-action="open-doc"]');(t.phase==='approval'?document.querySelector('[data-action="deny"]'):chip||$('documents-toggle')).focus();}
function toggleNav(){navOpen=!navOpen;layout();if(navOpen){$('navigation').classList.remove('reveal');void $('navigation').offsetWidth;$('navigation').classList.add('reveal');}if(navOpen&&innerWidth<760)$('new-thread').focus();else if(!navOpen)$('nav-toggle').focus();}
function directoryPanel(create=false){openPanel(create?'新会话的工作目录':'当前会话的工作目录',create?`<p>选择用于新会话的示例目录，不改变已有会话。</p>${directories.map((d,i)=>`<button class="choice" data-create-directory="${i}" type="button">${icon('folder')}<span><strong>${d.name}</strong><small>${d.path}</small></span></button>`).join('')}`:`<p>${escapeText(directories[current().directory].path)}</p><p>这是当前会话的固定目录。新建会话可选择不同目录。</p>`,create?$('new-thread'):$('thread-info'));}
function complete(){const atLatest=$('timeline').scrollHeight-$('timeline').scrollTop-$('timeline').clientHeight<80;remember();const t=current();if(t.phase==='cancelling'){t.phase='cancelled';render();toast('模拟宿主：执行与清理已结束');return;}
  if(['unknown','disconnected'].includes(t.phase)){toast('先恢复连接或核实已有结果');return;}
  if(t.hasDoc){t.newVersion=true;renderDocument();toast('新登记版本已到达，当前阅读未切换');return;}
  if(t.phase==='approval'){toast('先允许或拒绝当前操作');return;}
  if(t.phase!=='running'){toast('先发送一条任务');return;}
  t.phase='complete';t.hasDoc=true;const first=!t.firstDocSeen;t.firstDocSeen=true;
  if(first&&atLatest&&!t.docOpen&&!t.docDismissed&&$('open-policy').value==='auto'&&innerWidth-(navOpen?navWidth:0)-docWidth>=448)t.docOpen=true;
  render();if(atLatest)$('timeline').scrollTop=$('timeline').scrollHeight;toast('合成结果已到达；没有执行真实工具');
}
function submit(){const t=current();syncControls();if($('send').disabled)return;remember();const text=t.draft.trim();if(active(t)){t.queue.push(text);t.draft='';$('draft').value='';syncControls();return;}
  t.input=text;t.draft='';t.phase=t.mode==='manual'?'approval':'running';t.runMode=t.mode;t.hasDoc=false;t.docOpen=false;t.docDismissed=false;t.firstDocSeen=false;t.scroll=0;render();$('draft').focus();
}
async function copy(text){try{await navigator.clipboard.writeText(text);toast('已复制合成展示内容');}catch{toast('浏览器未允许复制；可选择展示文字复制');}}

$('scenario').onchange=()=>reset();$('reset').onclick=()=>reset();$('advance').onclick=complete;
$('new-thread').onclick=()=>directoryPanel(true);$('thread-info').onclick=()=>directoryPanel();
$('search').oninput=renderNavigation;$('filter').onclick=()=>{filtered=!filtered;renderNavigation();};$('clear-filter').onclick=()=>{filtered=false;renderNavigation();};
$('thread-list').onclick=e=>{const button=e.target.closest('[data-thread]');if(!button)return;remember();currentId=button.dataset.thread;if(innerWidth<760)navOpen=false;render();$('rename').focus();};
$('draft').oninput=()=>{current().draft=$('draft').value;syncControls();};
$('draft').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&!e.repeat&&e.keyCode!==229){e.preventDefault();submit();}};
$('send').onclick=submit;$('stop').onclick=()=>{remember();current().phase='cancelling';render();};
$('documents-toggle').onclick=()=>current().docOpen?closeDocument():openDocument();$('close-document').onclick=closeDocument;
$('nav-scrim').onclick=toggleNav;document.querySelectorAll('[data-action="nav"]').forEach(el=>el.onclick=toggleNav);
$('permission').onclick=()=>openPanel('后续任务的权限',`<p>只影响之后发送的任务；当前和已排队任务保持原模式。</p>${Object.entries(names).map(([mode,name])=>`<button class="choice" type="button" data-mode="${mode}" aria-pressed="${current().mode===mode}" ${current().pendingMode?'disabled':''}>${icon(current().mode===mode?'check':'shield')}<span><strong>${name}</strong><small>${descriptions[mode]}</small></span></button>`).join('')}${current().pendingMode?'<p>有一项设置尚未确认。关闭面板后可核对同次设置。</p>':''}`,$('permission'));
$('retry-permission').onclick=()=>{current().mode=current().pendingMode;current().pendingMode=null;syncControls();toast('模拟确认成功，后续任务将使用新模式');$('permission').focus();};
$('model').onclick=()=>openPanel('当前模型','<p><strong>gpt-6-luna</strong></p><p>本页只展示模型名称，没有连接 Provider。正式设置仍由已有产品入口管理。</p>',$('model'));
function contextPanel(){const t=current();openPanel('会话信息',`<div class="detail"><strong>工作目录</strong>${escapeText(directories[t.directory].path)}</div><div class="detail"><strong>${active(t)?'当前任务固定模式':'最近任务模式'}</strong>${names[t.runMode]}</div><div class="detail"><strong>后续任务模式</strong>${names[t.mode]}</div><p>停止不回滚已经发生的文件改动。这里的身份与记录都是合成样例。</p>`,$('context'));}
$('context').onclick=contextPanel;
$('rename').onclick=()=>openPanel('更改会话名称',`<label for="new-name">会话名称</label><input id="new-name" maxlength="160" value="${escapeText(current().title)}"><div class="panel-actions"><button data-action="close-panel" type="button">取消</button><button class="primary" data-action="save-name" type="button">保存</button></div>`,$('rename'));
$('document-picker').onclick=()=>openPanel('本会话的文档',current().hasDoc?docs.map((d,i)=>`<button class="choice" data-document="${i}" type="button">${icon('file')}<span><strong>${d.name}</strong><small>${d.path}${i===1?' · 额外合成样例':''}</small></span></button>`).join(''):'<p>这个会话还没有登记文档。</p>',$('document-picker'));
$('doc-details').onclick=()=>openPanel('版本与来源',`<div class="detail"><strong>${docs[current().docId].path}</strong>当前展示：登记版本 1 · 合成核验结果</div><div class="detail"><strong>来源</strong>整理秋季客户访谈 → 写入文档</div><p>版本记录不等于历史文件副本。当前文件若不匹配旧登记，不能显示为旧正文。</p><button class="secondary" data-action="old-version" type="button">查看旧版不可读状态</button>`,$('doc-details'));
$('doc-copy').onclick=()=>copy($('document-body').innerText);
$('close-panel').onclick=closePanel;$('panel').addEventListener('click',e=>{if(e.target===$('panel')){const r=$('panel').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closePanel();}});
$('panel').addEventListener('cancel',e=>{e.preventDefault();closePanel();});
document.addEventListener('click',e=>{
  const target=e.target.closest('button');if(!target)return;const action=target.dataset.action;
  if(target.dataset.mode){current().mode=target.dataset.mode;closePanel();syncControls();toast('合成设置已保存；当前任务模式未改变');}
  if(target.dataset.createDirectory!==undefined){remember();targetDirectory=Number(target.dataset.createDirectory);const t=makeThread('new-'+threads.length,'新会话',targetDirectory);t.phase='empty';t.hasDoc=false;t.firstDocSeen=false;threads.unshift(t);currentId=t.id;closePanel();if(innerWidth<760)navOpen=false;render();$('draft').focus();}
  if(target.dataset.document!==undefined){current().docId=Number(target.dataset.document);current().docScroll=0;closePanel();renderDocument();$('doc-scroll').scrollTop=0;}
  if(action==='return-approval')closeDocument();
  if(action==='approval-evidence')openPanel('本次写入内容','<p>研究项目 / 报告 / 秋季客户访谈总结.md</p><pre># 秋季客户访谈总结\n\n## 三个关键问题\n\n1. 进度透明\n2. 减少重复确认\n3. 成果可发现</pre><p>合成样例。目标或版本变化后需重新核对；本次任务保持人工审批。</p>',target);
  if(action==='directory')directoryPanel();if(action==='open-doc')openDocument();
  if(action==='approve'||action==='deny'){remember();current().phase=action==='approve'?'running':'denied';render();$('draft').focus();}
  if(action==='close-panel')closePanel();
  if(action==='save-name'){const name=$('new-name').value.trim();if(!name){$('new-name').focus();return;}current().title=name;closePanel();renderNavigation();$('rename').textContent=name;}
  if(action==='cancel-queue'){current().queue.shift();syncControls();}
  if(action==='copy-answer')void copy('三个关键问题：进度透明、减少重复确认、成果可发现。\n合成设计内容。');
  if(action==='reconnect'){current().phase='unknown';render();toast('模拟连接恢复，原任务仍需核实');}
  if(action==='recover'){current().phase='complete';current().hasDoc=true;render();toast('模拟核实已有文档；没有重新写入');}
  if(action==='recheck')toast('合成检查：文件仍与登记内容不同');
  if(action==='new-version'){current().newVersion=false;renderDocument();toast('切换到合成的新版本展示');}
  if(action==='old-version'){closePanel();current().phase='changed';renderDocument();}
  if(action==='return-active'){remember();currentId=threads.find(t=>t.id!==currentId&&active(t)).id;render();}
  if(action==='stop-other'){const t=threads.find(t=>t.id!==currentId&&active(t));t.phase='cancelling';renderNotice();toast('停止已请求；需回到该会话查看结算');}
});
$('timeline').addEventListener('scroll',()=>{$('latest').hidden=$('timeline').scrollHeight-$('timeline').scrollTop-$('timeline').clientHeight<120;});
$('latest').onclick=()=>{$('timeline').scrollTop=$('timeline').scrollHeight;};
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!$('panel').open){document.body.classList.add('tips-off');if(innerWidth<760&&navOpen){toggleNav();e.preventDefault();}else if(current().docOpen&&$('content').classList.contains('doc-overlay')){closeDocument();e.preventDefault();}}
  if(e.key==='Tab'&&innerWidth<760&&navOpen&&!$('panel').open){const nodes=[...$('navigation').querySelectorAll('button,input')].filter(n=>!n.disabled&&n.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
});
document.addEventListener('pointerover',()=>document.body.classList.remove('tips-off'));document.addEventListener('focusin',()=>document.body.classList.remove('tips-off'));
for(const [id,isNav] of [['nav-resize',true],['doc-resize',false]]){
  const el=$(id);let start=null;
  const set=value=>{const paired=current().docOpen&&!$('content').classList.contains('doc-overlay');if(isNav)navWidth=Math.max(200,Math.min(300,paired?innerWidth-docWidth-448:300,value));else docWidth=Math.max(360,Math.min(620,innerWidth-(navOpen?navWidth:0)-448,value));layout();};
  el.addEventListener('pointerdown',e=>{start={x:e.clientX,value:isNav?navWidth:docWidth};el.setPointerCapture(e.pointerId);});
  el.addEventListener('pointermove',e=>{if(start)set(start.value+(e.clientX-start.x)*(isNav?1:-1));});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(type,()=>start=null);
  el.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home'].includes(e.key)){e.preventDefault();set(e.key==='Home'?(isNav?232:440):(isNav?navWidth:docWidth)+(e.key==='ArrowRight'?20:-20)*(isNav?1:-1));}});
}
addEventListener('resize',()=>{if(innerWidth<760&&navOpen&&!$('navigation').contains(document.activeElement))navOpen=false;layout();});
reset();
