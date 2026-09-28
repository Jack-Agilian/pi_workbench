// Fixed security test program; not a product Worker entry or Renderer-selectable command.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { connect } from 'node:net';
const [database,port]=process.argv.slice(-2);
assert.throws(()=>readFileSync(database!));
assert.throws(()=>new DatabaseSync(database!));
assert.throws(()=>new DatabaseSync(database!+'.worker-created'));
await new Promise<void>((resolve,reject)=>{
 const socket=connect({host:'127.0.0.1',port:Number(port)});
 socket.setTimeout(1500,()=>{socket.destroy();reject(new Error('network_denial_not_observed'));});
 socket.once('connect',()=>{socket.destroy();reject(new Error('sandbox_network_escape'));});
 socket.once('error',(error:NodeJS.ErrnoException)=>{socket.destroy();try{assert.ok(['EPERM','EACCES'].includes(error.code??''));resolve();}catch(failure){reject(failure);}});
});
console.log('fixed worker policy: SQLite read/create and direct TCP denied by OS');
