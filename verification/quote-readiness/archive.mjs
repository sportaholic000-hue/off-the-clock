import fs from 'node:fs';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import crypto from 'node:crypto';
const root=path.resolve(process.argv[2]);
for(const part of ['public','before/public','after/public','browser/public']){
 const dir=path.join(root,part);if(!fs.existsSync(dir))continue;
 for(const file of fs.readdirSync(dir)){
  const bytes=fs.readFileSync(path.join(dir,file)),b=gzipSync(bytes).toString('base64'),name=part+'/'+file;
  for(let offset=0;offset<b.length;offset+=24000)console.log('READINESS_FILE '+JSON.stringify({source:process.env.GITHUB_SHA,name,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),offset,total:b.length,base64:b.slice(offset,offset+24000)}));
 }
}
