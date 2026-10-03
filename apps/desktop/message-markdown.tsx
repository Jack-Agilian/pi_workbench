import { CopyText } from './copy-text.tsx';
import { memo } from 'react';
import Markdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
// Behavior reference: pi-gui@1630542 message-markdown. No raw HTML plugins,
// resource fetching, SDK values, file opener or browser navigation authority.
const components:Components={
  pre:({node,children})=>{
    // react-markdown supplies a HAST code child. Never scrape DOM or include button labels.
    const code=node?.children.length===1?node.children[0]:undefined;
    const text=code?.type==='element'&&code.tagName==='code'&&code.children.every(child=>child.type==='text')?code.children.map(child=>child.type==='text'?child.value:'').join(''):null;
    return <div className="markdown-code">{text!==null&&<CopyText text={text} label="复制已显示代码"/>}<pre>{children}</pre></div>;
  },
  h1:({children})=><h3>{children}</h3>,h2:({children})=><h4>{children}</h4>,
  img:({alt})=><span className="blocked-image">[图片未加载{alt?`：${alt}`:''}]</span>,
  a:({href,children})=><span className="markdown-link">{children}{href&&<span className="link-address"> ({href})</span>}</span>,
  table:({children})=><div className="markdown-table"><table>{children}</table></div>,
};
const plugins=[remarkGfm];
const allowed=['p','strong','em','del','blockquote','ul','ol','li','h1','h2','h3','h4','h5','h6','hr','br','pre','code','a','img','table','thead','tbody','tr','th','td','input'];
export const MessageMarkdown=memo(function MessageMarkdown({text,copyLabel}:{text:string;copyLabel?:string}){
  return <div className="markdown-body"><Markdown skipHtml allowedElements={allowed} remarkPlugins={plugins} components={components}
    urlTransform={url=>/^(https?:\/\/)/i.test(url)?defaultUrlTransform(url):''}>{text}</Markdown>{copyLabel&&<CopyText text={text} label={copyLabel}/>}</div>;
});
