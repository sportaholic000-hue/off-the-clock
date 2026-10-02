import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(process.argv[2]);
function walk(dir){if(!fs.existsSync(dir))return;for(const item of fs.readdirSync(dir,{withFileTypes:true})){
 const file=path.join(dir,item.name),relative=path.relative(root,file).replaceAll(path.sep,'/');
 if(item.isDirectory()){if(item.name!=='private')walk(file);continue;}
 if(!/\.(json|png|tap)$/.test(item.name))continue;
 const content=fs.readFileSync(file),sha256=crypto.createHash('sha256').update(content).digest('hex');
 if(item.name.endsWith('.png'))console.log('EDITOR_IMAGE '+JSON.stringify({path:relative,sha256,base64:content.toString('base64')}));
 else console.log('EDITOR_TEXT '+JSON.stringify({path:relative,sha256,content:content.toString('utf8')}));
}}
walk(root);
