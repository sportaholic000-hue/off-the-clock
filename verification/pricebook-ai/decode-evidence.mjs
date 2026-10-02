import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const base=path.join(path.dirname(fileURLToPath(import.meta.url)),'evidence');
const out=path.resolve(process.argv[2]||path.join(base,'decoded'));
const manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.json'),'utf8'));
for(const file of manifest.files) {
 const parts=file.parts.map(p=>fs.readFileSync(path.join(base,p),'utf8').trim());
 const packed=Buffer.from(parts.join(''),'base64');
 if(createHash('sha256').update(packed).digest('hex')!==file.gzipSha256)throw Error('Hash mismatch: '+file.name);
 const bytes=gunzipSync(packed);
 if(createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('Decoded hash mismatch: '+file.name);
 const target=path.resolve(out,file.name);
 if(!target.startsWith(out+path.sep))throw Error('Invalid evidence path');
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);
}
console.log('Verified and decoded '+manifest.files.length+' original evidence files into '+out);
