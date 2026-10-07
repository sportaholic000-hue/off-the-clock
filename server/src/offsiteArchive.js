import fs from 'node:fs';
import path from 'node:path';
import {createHash,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {verifyBackup} from './backups.js';

const MAGIC=Buffer.from('OTCBK001');
export const MAX_ARCHIVE_BYTES=4*1024**3;
export async function fileChecksum(file) {
  const hash=createHash('sha256');
  for await(const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export async function encryptBundle(bundle,file,key) {
  const manifest=verifyBackup(bundle), metadata=Buffer.from(JSON.stringify(manifest));
  const length=Buffer.alloc(4);length.writeUInt32BE(metadata.length);
  const total=4+metadata.length+manifest.files.reduce((sum,entry)=>sum+entry.bytes,0)+36;
  if(metadata.length>1024*1024 || total>MAX_ARCHIVE_BYTES) throw Error('OFFSITE_ARCHIVE_TOO_LARGE');
  const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(MAGIC);
  fs.writeFileSync(file,Buffer.concat([MAGIC,nonce]),{flag:'wx',mode:0o600});
  async function* contents() {
    yield length;yield metadata;
    for(const entry of manifest.files) {
      const hash=createHash('sha256');let count=0;
      for await(const chunk of fs.createReadStream(path.join(bundle,entry.name))) {hash.update(chunk);count+=chunk.length;yield chunk;}
      if(count!==entry.bytes || hash.digest('hex')!==entry.sha256)throw Error('BACKUP_CHANGED_DURING_UPLOAD');
    }
  }
  try {
    await pipeline(Readable.from(contents()),cipher,fs.createWriteStream(file,{flags:'a',mode:0o600}));
    fs.appendFileSync(file,cipher.getAuthTag(),{flush:true});
    return {sha256:await fileChecksum(file),bytes:fs.statSync(file).size};
  } catch(error) {fs.rmSync(file,{force:true});throw error;}
}
export async function decryptBundle(file,directory,key) {
  const size=fs.statSync(file).size;
  if(size<40 || size>MAX_ARCHIVE_BYTES)throw Error('OFFSITE_ARCHIVE_INVALID');
  const fd=fs.openSync(file,'r'),header=Buffer.alloc(20),tag=Buffer.alloc(16);
  try {fs.readSync(fd,header,0,20,0);fs.readSync(fd,tag,0,16,size-16);}finally{fs.closeSync(fd);}
  if(!header.subarray(0,8).equals(MAGIC))throw Error('OFFSITE_ARCHIVE_INVALID');
  const plain=directory+'.plain';
  const decipher=createDecipheriv('aes-256-gcm',key,header.subarray(8));decipher.setAAD(MAGIC);decipher.setAuthTag(tag);
  try {
    try {await pipeline(fs.createReadStream(file,{start:20,end:size-17}),decipher,fs.createWriteStream(plain,{flags:'wx',mode:0o600}));}
    catch {throw Error('OFFSITE_DECRYPTION_FAILED');}
    const handle=fs.openSync(plain,'r');let offset=0;
    const read=count=>{const bytes=Buffer.alloc(count);if(fs.readSync(handle,bytes,0,count,offset)!==count)throw Error('OFFSITE_ARCHIVE_INVALID');offset+=count;return bytes;};
    try {
      const length=read(4).readUInt32BE();if(length>1024*1024)throw Error('OFFSITE_ARCHIVE_INVALID');
      const manifest=JSON.parse(read(length).toString('utf8'));
      if(manifest.version!==1 || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length>100000)throw Error('OFFSITE_ARCHIVE_INVALID');
      const names=new Set();
      for(const entry of manifest.files) {
        if(!(entry.name==='off-the-clock.sqlite' || /^pricebooks\/[A-Za-z0-9][A-Za-z0-9_-]{0,127}\.json$/.test(entry.name)) || names.has(entry.name) || !Number.isSafeInteger(entry.bytes) || entry.bytes<0 || !/^[a-f0-9]{64}$/.test(entry.sha256))throw Error('OFFSITE_ARCHIVE_INVALID');
        names.add(entry.name);
      }
      if(offset+manifest.files.reduce((sum,entry)=>sum+entry.bytes,0)!==fs.statSync(plain).size)throw Error('OFFSITE_ARCHIVE_INVALID');
      fs.mkdirSync(directory,{mode:0o700});
      fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest),{flag:'wx',mode:0o600,flush:true});
      for(const entry of manifest.files) {
        const target=path.join(directory,entry.name);fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
        if(entry.bytes)await pipeline(fs.createReadStream(plain,{start:offset,end:offset+entry.bytes-1}),fs.createWriteStream(target,{flags:'wx',mode:0o600}));
        else fs.writeFileSync(target,'',{flag:'wx',mode:0o600});
        offset+=entry.bytes;
      }
    } finally {fs.closeSync(handle);}
    verifyBackup(directory);
  } catch(error) {fs.rmSync(directory,{recursive:true,force:true});throw error;}
  finally {fs.rmSync(plain,{force:true});}
}
