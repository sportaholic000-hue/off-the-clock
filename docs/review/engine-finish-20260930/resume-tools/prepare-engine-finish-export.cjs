const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'engine-finish-20260930'),base=JSON.parse(fs.readFileSync(path.join(__dirname,'engine-finish-base-manifest.json'),'utf8')),paths=new Set(base.map(x=>x.path));
function walk(dir,rel){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','dist','data','.git','.portable-runtime'].includes(e.name))continue;const p=rel+'/'+e.name;if(e.isDirectory())walk(path.join(dir,e.name),p);else if(e.isFile())paths.add(p);}}
for(const d of ['server','client/src','client/test','test','verification','docs/review'])walk(path.join(root,d),d);
const byPath=new Map(base.map(x=>[x.path,x]));
const manifest=[...paths].sort().map(p=>{const data=fs.readFileSync(path.join(root,p));return {path:p,mode:byPath.get(p)?.mode||'100644',sha:crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+data.length+'\0'),data])).digest('hex'),size:data.length};});
const changed=manifest.filter(x=>byPath.get(x.path)?.sha!==x.sha),groups=[];let group=[],total=0;
for(const row of changed)for(let offset=0;offset<row.size;offset+=196608){const size=Math.min(196608,row.size-offset);if(total+size>240000&&group.length){groups.push(group);group=[];total=0;}group.push({...row,offset,length:size});total+=size;}if(group.length)groups.push(group);
for(const [name,value]of Object.entries({'candidate-manifest':manifest,changed,'export-groups':groups}))fs.writeFileSync(path.join(__dirname,'engine-finish-'+name+'.json'),JSON.stringify(value,null,2));
console.log(JSON.stringify({files:manifest.length,changed:changed.length,groups:groups.length,bytes:changed.reduce((a,r)=>a+r.size,0)}));
