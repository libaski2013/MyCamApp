import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('public/vendor',{recursive:true});
await build({stdin:{contents:"export {createDecartClient,models} from '@decartai/sdk';",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'public/vendor/decart.mjs',minify:true});

// esbuild keeps import.meta.url worker references relative to the emitted bundle.
await copyFile('node_modules/@decartai/sdk/dist/realtime/browser/frame-metadata-worker.js','public/vendor/frame-metadata-worker.js');
