const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const [root,out]=process.argv.slice(2);fs.mkdirSync(out,{recursive:true});
const records=[];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function save(name,value,meta={}){const bytes=Buffer.from(JSON.stringify(value)),gz=zlib.gzipSync(bytes),file=path.join(out,name);fs.writeFileSync(file,gz);records.push({path:name,bytes:gz.length,sha256:hash(gz),uncompressedSha256:hash(bytes),...meta});}
const files={};for(const name of fs.readdirSync(root)){if(/\.(?:log|source\.json|result\.json)$/.test(name)){if(name.endsWith('.log')&&!fs.existsSync(path.join(root,name.replace(/\.log$/,'.result.json')))&&name!=='final-layout-before.log')continue;const b=fs.readFileSync(path.join(root,name));files[name]={sha256:hash(b),content:b.toString('utf8')};}}
for(const name of ['baseline-source.json','interrupted-runs.json','final-cold-baseline-comparison.json','final-build-assets.json','final-github-source-verification.json','final-scope-boundary.json'])if(fs.existsSync(path.join(root,name))){const b=fs.readFileSync(path.join(root,name));files[name]={sha256:hash(b),content:b.toString('utf8')};}
save('run-evidence.json.gz',{files},{redacted:false});
let omitted=0;
function safe(value,key=''){
 if(typeof value==='string'){
  if(!/[\\/]/.test(key)&&/token|secret|password|authorization|cookie|signature|^nonce$/i.test(key)){omitted++;return '[SYNTHETIC CREDENTIAL OMITTED]';}
  if(key.endsWith('Json')){try{return JSON.stringify(safe(JSON.parse(value)));}catch{}}
 }
 if(Array.isArray(value))return value.map(v=>safe(v));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,safe(v,k)]));
 return value;
}
for(const [folder,names] of [
 ['application-before',['application-results.json','http.json','reassessment.json','source-binding.json']],
 ['application-after',['application-results.json','http.json','source-binding.json']],
 ['booking-marker-before',['REVIEW_RESULTS.json','http.json','synthetic-calendar-provider.json','source-binding.json']],
 ['final-booking-marker',['REVIEW_RESULTS.json','http.json','synthetic-calendar-provider.json','source-binding.json']],
 ['final-widget-booking',['failed-results.json','http.json','source-binding.json']],
 ['final-widget-booking-2',['result.json','api-controls.json','http.json','synthetic-calendar-provider.json','source-binding.json']],
 ['final-offerings-browser',['results.json','saved-book.json','browser-http.json','http.json','source-binding.json']],
 ['offerings-browser-5-5',['results.json','saved-book.json','browser-http.json','http.json','source-binding.json']],
 ['final-layout-before-3',['layout-results.json','source-binding.json']],
 ['final-layout-after',['layout-results.json','source-binding.json']]
]){
 omitted=0;const originals={},data={};for(const name of names){const b=fs.readFileSync(path.join(root,folder,name));originals[name]=hash(b);data[name]=safe(JSON.parse(b.toString()));}
 save(folder+'.json.gz',data,{originalHashes:originals,redacted:true,syntheticCredentialFieldsOmitted:omitted,note:'Only ephemeral synthetic credential fields are replaced; quote inputs, pricing responses and calculation records are retained. Original unredacted files remain in the isolated evidence directory.'});
}
fs.writeFileSync(path.join(out,'review-archive-index.json'),JSON.stringify(records,null,2));console.log(JSON.stringify(records.map(x=>({path:x.path,bytes:x.bytes,redactions:x.syntheticCredentialFieldsOmitted})),null,2));
