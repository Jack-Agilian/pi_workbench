// Host-side preview only: Pi computes edit semantics through explicit memory Operations.
import { createEditTool, createReadToolDefinition, createWriteToolDefinition, createEditToolDefinition } from '@earendil-works/pi-coding-agent';
import { resolve } from 'node:path';
import type { FileToolRequest } from '../app-contracts/file-tools.ts';
import { digest } from './controlled-tools.ts';
export async function plannedFileDigest(workspace:string, request:FileToolRequest, before:string|null):Promise<string|null> {
 if(request.tool==='read')return before===null?null:digest(before);
 if(request.tool==='write')return digest(request.parameters.content);
 if(before===null)return null;
 let result:string|undefined;
 const target=resolve(workspace,request.parameters.path);
 const check=(path:string)=>{if(path!==target)throw new Error('file_preview_target');};
 const tool=createEditTool(workspace,{operations:{access:async path=>check(path),readFile:async path=>{check(path);return Buffer.from(before);},writeFile:async(path,text)=>{check(path);result=text;}}});
 try{await tool.execute('host-edit-preview',request.parameters,new AbortController().signal);}catch{return null;}
 if(result!==undefined&&(Buffer.byteLength(result)>16000||result.includes('\0')))throw new Error('file_preview_size');
 return result===undefined?null:digest(result);
}
/** Public metadata only, used to admit exactly the registered three file tool schemas. */
export function fileToolSchemas() {
 return [createReadToolDefinition('/'),createWriteToolDefinition('/'),createEditToolDefinition('/')].map(t=>({name:t.name,parameters:t.parameters}));
}
