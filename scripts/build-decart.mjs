import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('public/vendor',{recursive:true});
await build({stdin:{contents:"export {createDecartClient,models} from '@decartai/sdk';",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'public/vendor/decart.mjs',minify:true});
