const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'engine-finish-20260930'),groups=JSON.parse(fs.readFileSync(path.join(__dirname,'engine-finish-export-groups.json'),'utf8'));
const selected=groups[Number(process.argv[2])];if(!selected)throw Error('Unknown group');const wanted=process.argv.slice(3),group=wanted.length?selected.filter(row=>wanted.includes(row.path)):selected;
const out=group.map(row=>{const full=path.resolve(root,row.path);if(!full.startsWith(root+path.sep))throw Error('Outside source');const bytes=fs.readFileSync(full),sha=crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),bytes])).digest('hex');if(sha!==row.sha)throw Error('Source changed '+row.path);return {...row,content:bytes.subarray(row.offset,row.offset+row.length).toString('base64')};});
process.stdout.write(JSON.stringify(out));
