import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const host='127.0.0.1';
function available(port){return new Promise(resolve=>{const server=createServer();server.once('error',()=>resolve(false));server.listen(port,host,()=>server.close(()=>resolve(true)))});}
let port=3000;while(port<=3010&&!(await available(port)))port++;
if(port>3010){console.error('MyCam could not find an open port between 3000 and 3010.');process.exit(1)}
const url=`http://${host}:${port}`;
const child=spawn(process.execPath,[join(root,'server.js')],{cwd:root,env:{...process.env,PORT:String(port),HOST:host},stdio:['inherit','inherit','inherit']});
let stopped=false;
child.once('exit',(code)=>{stopped=true;console.error(`MyCam server stopped (exit ${code??'unknown'}).`);process.exitCode=code||1});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{child.kill(signal);process.exit(0)});
let ready=false;for(let attempt=0;attempt<80&&!stopped;attempt++){
  try{const response=await fetch(`${url}/api/health`,{signal:AbortSignal.timeout(1000)});if(response.ok){ready=true;break}}catch{}
  await new Promise(resolve=>setTimeout(resolve,250));
}
if(!ready){if(!stopped)child.kill();console.error('MyCam did not become ready. Read the error above.');process.exit(1)}
console.log(`\nMyCam is ready: ${url}\nKeep this window open while using MyCam. Press Ctrl+C to stop.\n`);
const opener=process.platform==='win32'?['cmd',['/c','start','',url]]:process.platform==='darwin'?['open',[url]]:['xdg-open',[url]];
const browser=spawn(opener[0],opener[1],{stdio:'ignore'});
browser.on('error',()=>console.log(`Open ${url} manually in your browser.`));
