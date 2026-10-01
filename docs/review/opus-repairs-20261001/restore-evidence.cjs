const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),zlib=require('node:zlib'),{Readable,Transform,Writable}=require('node:stream'),{pipeline}=require('node:stream/promises');
const base=path.join(__dirname,'evidence'),verifyOnly=process.argv[2]==='--verify-only',dest=verifyOnly?null:path.resolve(process.argv[2]||'');
if(!verifyOnly&&!process.argv[2])throw Error('Usage: node restore-evidence.cjs --verify-only OR a fresh output directory');
if(dest){assert.equal(fs.existsSync(dest),false,'Use a fresh output directory');fs.mkdirSync(dest,{recursive:true});}
const inside=file=>{const p=path.resolve(base,file);assert.ok(p.startsWith(path.resolve(base)+path.sep));return p;};
const records=[...JSON.parse(fs.readFileSync(inside('arithmetic-archive-index.json'),'utf8')),...JSON.parse(fs.readFileSync(inside('review-archive-index.json'),'utf8'))];
(async()=>{const verified=[];for(const r of records){let packedBytes=0,rawBytes=0;const packed=crypto.createHash('sha256'),raw=crypto.createHash('sha256');
 async function* chunks(){for(const p of r.parts||[{file:r.path}]){const b=fs.readFileSync(inside(p.file));if(p.gitBlob)assert.equal(crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+b.length+'\0'),b])).digest('hex'),p.gitBlob);yield b;}}
 const sink=verifyOnly?new Writable({write(b,e,cb){cb();}}):fs.createWriteStream(path.join(dest,path.basename(r.path).replace(/\.gz$/,'')),{flags:'wx'});
 await pipeline(Readable.from(chunks()),new Transform({transform(b,e,cb){packed.update(b);packedBytes+=b.length;cb(null,b);}}),zlib.createGunzip(),new Transform({transform(b,e,cb){raw.update(b);rawBytes+=b.length;cb(null,b);}}),sink);
 assert.equal(packedBytes,r.bytes);assert.equal(packed.digest('hex'),r.sha256);if(r.originalBytes)assert.equal(rawBytes,r.originalBytes);assert.equal(raw.digest('hex'),r.originalSha256||r.uncompressedSha256);verified.push({path:r.path,packedBytes,rawBytes});}
 console.log(JSON.stringify({passed:true,verifyOnly,verified},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
