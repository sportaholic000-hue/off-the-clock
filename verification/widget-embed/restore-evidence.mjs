import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'evidence');
function write(file,data){
 if(fs.existsSync(file)){assert.deepEqual(fs.readFileSync(file),data,'Existing evidence differs: '+file);return;}
 fs.writeFileSync(file,data,{flag:'wx'});console.log(path.relative(root,file));
}
for(const phase of ['baseline','final']){
 const dir=path.join(root,phase);
 for(const name of fs.readdirSync(dir).filter(name=>name.endsWith('.gz')))write(path.join(dir,name.slice(0,-3)),gunzipSync(fs.readFileSync(path.join(dir,name))));
}
const dir=path.join(root,'baseline'),parts=fs.readdirSync(dir).filter(name=>name.startsWith('owner-installation.png.base64-part-')).sort();
assert.equal(parts.length,4);
write(path.join(dir,'owner-installation.png'),Buffer.from(parts.map(name=>fs.readFileSync(path.join(dir,name),'utf8')).join(''),'base64'));
