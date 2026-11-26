import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';

// Owner ruling 2026-11-13: the Quotes pipeline reads "PRICED INSTANTLY" instead
// of "INSTANT" on the Quotes page and in the two spec lines; nothing else
// changes. Expected values written before running.
const LINE='PRICED INSTANTLY / NEEDS REVIEW / SENT / VIEWED / ACCEPTED / INVOICED · Stages record actual owner activity; no caller messages are sent.';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8').split('\n');

test('the Quotes page shows the PRICED INSTANTLY pipeline line',async()=>{
  const vite=await createServer({root:fileURLToPath(new URL('../client',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  try{
    const {QuoteRecords}=await vite.ssrLoadModule('/src/quotedone.jsx');
    const html=renderToStaticMarkup(React.createElement(QuoteRecords,{kind:'quotes'}));
    assert.ok(html.includes('<p>'+LINE+'</p>'),html);
    assert.doesNotMatch(html,/>INSTANT \//);
    const leads=renderToStaticMarkup(React.createElement(QuoteRecords,{kind:'leads'}));
    assert.equal(leads.includes('PRICED INSTANTLY'),false,'the Leads page has no pipeline line');
  }finally{await vite.close();}
});

test('the two spec lines read PRICED INSTANTLY',()=>{
  assert.equal(read('specs/platform_spec_v2.md')[600],'  Status pipeline: PRICED INSTANTLY / NEEDS REVIEW / SENT / VIEWED /');
  assert.equal(read('specs/platform_spec_v2.md')[601],'  ACCEPTED / INVOICED. Tier chosen, range, drivers, linked');
  assert.equal(read('specs/build_guide.md')[572],'   Quotes (6.4): status pipeline PRICED INSTANTLY / NEEDS REVIEW /');
  assert.equal(read('specs/build_guide.md')[573],'     SENT / VIEWED / ACCEPTED / INVOICED. NEEDS REVIEW');
});
