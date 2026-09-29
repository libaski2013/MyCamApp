import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const packageRoot=join(root,'node_modules','@mediapipe','tasks-vision');
const vendor=join(root,'public','vendor');
const wasm=join(vendor,'wasm');
const models=join(root,'public','models');
const target=join(models,'face_landmarker.task');
const hash='64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff';
const modelUrl='https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
await Promise.all([mkdir(wasm,{recursive:true}),mkdir(models,{recursive:true})]);
await copyFile(join(packageRoot,'vision_bundle.mjs'),join(vendor,'vision_bundle.mjs'));
for(const name of ['vision_wasm_internal.js','vision_wasm_internal.wasm','vision_wasm_module_internal.js','vision_wasm_module_internal.wasm','vision_wasm_nosimd_internal.js','vision_wasm_nosimd_internal.wasm'])await copyFile(join(packageRoot,'wasm',name),join(wasm,name));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
let current=null;try{current=await readFile(target)}catch{}
if(!current||digest(current)!==hash){
  console.log('Downloading pinned face tracking model…');
  const response=await fetch(modelUrl,{signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw new Error(`Model download failed: HTTP ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(digest(bytes)!==hash)throw new Error('Downloaded face model checksum mismatch');
  await writeFile(target,bytes);
}
console.log('Local face tracking assets ready.');
