import fs from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Writable} from 'node:stream';
import {S3Client,PutObjectCommand,GetObjectCommand,HeadObjectCommand,ListObjectsV2Command,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {MAX_ARCHIVE_BYTES} from './offsiteArchive.js';

export function readOffsiteConfig(env=process.env) {
  const required=['OFFSITE_BACKUP_ENDPOINT','OFFSITE_BACKUP_BUCKET','OFFSITE_BACKUP_ACCESS_KEY_ID','OFFSITE_BACKUP_SECRET_ACCESS_KEY','OFFSITE_BACKUP_ENCRYPTION_KEY'];
  const missing=required.filter(name=>!env[name]);
  if(missing.length)return {enabled:false,reason:'OFFSITE_CONFIG_MISSING',missing};
  try {
    const endpoint=new URL(env.OFFSITE_BACKUP_ENDPOINT);
    if(endpoint.username || endpoint.password || endpoint.search || endpoint.hash || (endpoint.protocol!=='https:' && !(endpoint.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname))))throw Error();
    const text=env.OFFSITE_BACKUP_ENCRYPTION_KEY;
    const key=/^[a-fA-F0-9]{64}$/.test(text)?Buffer.from(text,'hex'):Buffer.from(text,'base64');
    if(key.length!==32 || (!/^[a-fA-F0-9]{64}$/.test(text) && key.toString('base64')!==text))throw Error();
    const prefix=env.OFFSITE_BACKUP_PREFIX || 'off-the-clock';
    if(!/^[A-Za-z0-9][A-Za-z0-9_/-]{0,127}$/.test(prefix) || prefix.split('/').some(s=>!s) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(env.OFFSITE_BACKUP_BUCKET))throw Error();
    return {enabled:true,endpoint:endpoint.href,bucket:env.OFFSITE_BACKUP_BUCKET,key,prefix,region:env.OFFSITE_BACKUP_REGION || 'us-east-1',
      credentials:{accessKeyId:env.OFFSITE_BACKUP_ACCESS_KEY_ID,secretAccessKey:env.OFFSITE_BACKUP_SECRET_ACCESS_KEY,...(env.OFFSITE_BACKUP_SESSION_TOKEN?{sessionToken:env.OFFSITE_BACKUP_SESSION_TOKEN}:{})}};
  } catch {return {enabled:false,reason:'OFFSITE_CONFIG_INVALID',missing:[]};}
}
export function createS3BackupStore(config) {
  const client=new S3Client({endpoint:config.endpoint,region:config.region,credentials:config.credentials,forcePathStyle:true,maxAttempts:3,
    requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',requestHandler:{connectionTimeout:5000,requestTimeout:30000}});
  const send=command=>client.send(command,{abortSignal:AbortSignal.timeout(30000)});
  const params=Key=>({Bucket:config.bucket,Key});
  return {
    async putFile(key,file,sha256) {await send(new PutObjectCommand({...params(key),Body:fs.createReadStream(file),ContentLength:fs.statSync(file).size,ContentType:'application/octet-stream',Metadata:{sha256},IfNoneMatch:'*'}));},
    async putRecord(key,record) {const body=JSON.stringify(record);await send(new PutObjectCommand({...params(key),Body:body,ContentLength:Buffer.byteLength(body),ContentType:'application/json',IfNoneMatch:'*'}));},
    async record(key) {
      try {const response=await send(new GetObjectCommand(params(key)));if(response.ContentLength>4096){response.Body.destroy();throw Error('OFFSITE_RECORD_INVALID');}
        let bytes=0;const chunks=[];
        await pipeline(response.Body,new Writable({write(chunk,_encoding,next){bytes+=chunk.length;if(bytes>4096)return next(Error('OFFSITE_RECORD_INVALID'));chunks.push(chunk);next();}}),{signal:AbortSignal.timeout(30000)});
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
      catch(error){if(error.$metadata?.httpStatusCode===404)return null;throw error;}
    },
    async download(key,file,expectedBytes) {
      const response=await send(new GetObjectCommand(params(key)));
      if(response.ContentLength!==expectedBytes || expectedBytes>MAX_ARCHIVE_BYTES){response.Body.destroy();throw Error('OFFSITE_SIZE_MISMATCH');}
      let bytes=0;response.Body.on('data',chunk=>{bytes+=chunk.length;if(bytes>expectedBytes)response.Body.destroy(Error('OFFSITE_SIZE_MISMATCH'));});
      await pipeline(response.Body,fs.createWriteStream(file,{flags:'wx',mode:0o600}),{signal:AbortSignal.timeout(30000)});
      if(bytes!==expectedBytes)throw Error('OFFSITE_SIZE_MISMATCH');
    },
    async head(key) {try{return await send(new HeadObjectCommand(params(key)));}catch(error){if(error.$metadata?.httpStatusCode===404)return null;throw error;}},
    async list(prefix) {
      const keys=[];let token;const seen=new Set();
      do {const response=await send(new ListObjectsV2Command({Bucket:config.bucket,Prefix:prefix,ContinuationToken:token}));
        keys.push(...(response.Contents||[]).map(entry=>entry.Key));token=response.IsTruncated?response.NextContinuationToken:null;
        if(response.IsTruncated && !token)throw Error('OFFSITE_LIST_INVALID');
        if(token && seen.has(token))throw Error('OFFSITE_LIST_INVALID');seen.add(token);
      } while(token);
      return keys;
    },
    async remove(key) {await send(new DeleteObjectCommand(params(key)));},
    close:()=>client.destroy()
  };
}
export const isConflict=error=>error.$metadata?.httpStatusCode===412;
