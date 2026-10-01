import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const [sourceRoot,quotesFile,out]=process.argv.slice(2);
const require=createRequire(path.join(sourceRoot,'package.json'));
const esbuild=require('esbuild');
const entry='import React from '+JSON.stringify(require.resolve('react'))+'; import {renderToStaticMarkup} from '+JSON.stringify(require.resolve('react-dom/server'))+'; import {QuoteResult} from '+JSON.stringify(path.join(sourceRoot,'client/src/quotedone.jsx'))+'; export const render=result=>renderToStaticMarkup(React.createElement(QuoteResult,{result}));';
const bundle=out+'.cjs';
await esbuild.build({stdin:{contents:entry,resolveDir:sourceRoot,loader:'jsx'},bundle:true,platform:'node',format:'cjs',outfile:bundle,define:{'import.meta.env':'{}'},logLevel:'error'});
const {render}=require(bundle),quoteRows=JSON.parse(fs.readFileSync(quotesFile,'utf8')).rows;
const rows=quoteRows.map(row=>{const html=render(row.customer),articles=[...html.matchAll(/<article[^>]*>([\s\S]*?)<\/article>/g)].map(m=>m[1].replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()),findings=[];assert.equal(articles.length,row.customer.options.length,row.id);
 for(const [i,text]of articles.entries()){const o=row.customer.options[i];if(o.priceUnit==='per visit'&&(text.match(/per visit/g)||[]).length!==1)findings.push({option:i,kind:'repeated rendered unit'});if(o.taxTreatment&&text.split(o.taxTreatment).length-1!==1)findings.push({option:i,kind:'repeated rendered tax treatment'});}
 return{id:row.id,html,articles,findings};});
const summary={sourceRoot,cases:rows.length,options:rows.reduce((n,r)=>n+r.articles.length,0),findings:rows.reduce((n,r)=>n+r.findings.length,0)};
fs.writeFileSync(out,JSON.stringify({summary,rows},null,2));console.log(JSON.stringify(summary));assert.equal(summary.findings,0);
