import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {gunzipSync} from 'node:zlib';

const base=path.resolve(process.argv[2]||'final-25fca48');
const manifest=JSON.parse(await fs.readFile(path.join(base,'manifest.json'),'utf8'));
const out=path.resolve(base,'decoded');
function inside(root,relative){
  const target=path.resolve(root,relative);
  if(!target.startsWith(root+path.sep))throw new Error('Invalid evidence path: '+relative);
  return target;
}
for(const file of manifest.files){
  const archived=await fs.readFile(inside(base,file.archive));
  const gitBlob=crypto.createHash('sha1').update('blob '+archived.length+'\0').update(archived).digest('hex');
  if(gitBlob!==file.archiveGitBlob)throw new Error(file.name+': archived Git blob mismatch');
  const encoded=archived.toString('utf8').trim();
  if(encoded.length!==file.base64Length)throw new Error(file.name+': incomplete archive');
  const raw=gunzipSync(Buffer.from(encoded,'base64'));
  const sha256=crypto.createHash('sha256').update(raw).digest('hex');
  if(file.sha256&&sha256!==file.sha256)throw new Error(file.name+': content hash mismatch');
  const target=inside(out,file.name);
  await fs.mkdir(path.dirname(target),{recursive:true});
  await fs.writeFile(target,raw);
  console.log(file.name+' '+sha256);
}
console.log('Decoded '+manifest.files.length+' files for source '+manifest.source);
