import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

// Synthetic website fixtures. These are not Off The Clock business policies.
// Run with Node and the target repository's installed dependencies:
// node --test-reporter=tap reproduce.mjs /absolute/path/to/off-the-clock
const root=resolve(process.argv[2]||'.');
const moduleAt=relative=>import(pathToFileURL(join(root,relative)).href);
const {createWebsitePriceImporter}=await moduleAt('server/src/websitePriceImport.js');
const {calculateSavedListedPrice}=await moduleAt('server/src/voice/listedPriceCalculation.js');
const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const source='server/src/websitePriceExtraction.js';
console.log('# source '+JSON.stringify({sha,source,sha256:createHash('sha256').update(readFileSync(join(root,source))).digest('hex')}));
const price='Widget $10 each';
const notes=[
  'Site-wide: customers must prepay before work starts',
  'Site-wide: customers must prepay by Friday',
  'Site-wide: weather permitting on the day',
  'Site-wide: online orders must be prepaid in full',
  'Site-wide: payment must be made in advance of delivery'
];
const html=text=>'<html><body>'+text+'</body></html>';
for(const [index,note]of notes.entries())test('synthetic condition extension '+(index+1)+': '+note,async t=>{
  const pages={
    '/':html('<p>'+note+'</p><a href="/prices">Prices</a>'),
    '/prices':html('<p>'+price+'</p>')
  };
  const seen=[];
  const server=http.createServer((req,res)=>{
    if(!Object.hasOwn(pages,req.url)){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type','text/html');res.end(pages[req.url]);
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
  const importer=createWebsitePriceImporter({
    lookup:async()=>[{address:'8.8.8.8',family:4}],
    request:(url,options,callback)=>{
      seen.push(url.pathname);
      return http.request(new URL(url.pathname+url.search,'http://127.0.0.1:'+server.address().port),{...options,lookup:undefined},callback);
    }
  });
  const imported=await importer('https://synthetic.example/');
  const result=calculateSavedListedPrice({prices:imported.prices},{listedItem:price,quantity:'3',customerConfirmed:true});
  t.diagnostic(JSON.stringify({sha,note,pages,seen,imported,result}));
  assert.deepEqual(seen,['/','/prices'],'Both pages must actually be read');
  assert.equal(imported.websiteImport.pages.length,2);
  assert.ok(imported.prices===''||imported.prices.includes(note),'Retain the visible explicit condition verbatim, or withhold the affected listing');
  assert.equal(result.status,'needs_review');
  assert.equal(Object.hasOwn(result,'extendedAmount'),false);
});
