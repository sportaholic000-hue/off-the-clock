import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';

// Public site (site/www) search basics, checked on every page.
// HANDWRITTEN EXPECTATIONS, before execution:
// - every page has a title, and every title except the homepage's (the locked
//   headline) fits in 60 characters, so search results don't cut it off;
// - no two pages share a title or a description;
// - every page's canonical address is its own address with the ending "/", and it is
//   listed in sitemap.xml under that same address;
// - privacy and terms carry the same link-preview tags as the other pages.
const WWW=fileURLToPath(new URL('../site/www/',import.meta.url));
const ORIGIN='https://www.offtheclockai.com';
const pages=[];
(function walk(dir){for(const name of readdirSync(dir)){const p=join(dir,name);if(statSync(p).isDirectory())walk(p);else if(name==='index.html')pages.push('/'+relative(WWW,dir).split('\\').join('/')+(dir===WWW.replace(/\/$/,'')?'':'/'));}})(WWW.replace(/\/$/,''));
const norm=p=>p.replace(/^\/+/,'/');
const read=path=>readFileSync(join(WWW,path,'index.html'),'utf8');
const meta=(html,attr,name)=>(html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)">`))||[])[1];
const title=html=>(html.match(/<title>([^<]*)<\/title>/)||[])[1];

test('every page title fits in search results and is unique',()=>{
  const seen=new Map();
  for(const p of pages.map(norm)){
    const t=title(read(p));
    assert.ok(t,`${p} has no title`);
    if(p!=='/')assert.ok(t.length<=60,`${p} title is ${t.length} characters: ${t}`);
    assert.ok(!seen.has(t),`${p} and ${seen.get(t)} share the title ${t}`);seen.set(t,p);
  }
  assert.ok(pages.length>=60,`only ${pages.length} pages found`);
});

test('no two pages share a description',()=>{
  const seen=new Map();
  for(const p of pages.map(norm)){
    const d=meta(read(p),'name','description');
    assert.ok(d,`${p} has no description`);
    assert.ok(!seen.has(d),`${p} and ${seen.get(d)} share a description`);seen.set(d,p);
  }
});

test('every canonical address is the page itself and is in the sitemap',()=>{
  const sitemap=readFileSync(join(WWW,'sitemap.xml'),'utf8');
  for(const p of pages.map(norm)){
    const html=read(p),canonical=(html.match(/<link rel="canonical" href="([^"]*)">/)||[])[1];
    assert.equal(canonical,ORIGIN+p,`${p} canonical`);
    assert.ok(sitemap.includes(`<loc>${ORIGIN+p}</loc>`),`${p} missing from sitemap`);
    assert.equal(meta(html,'property','og:url'),ORIGIN+p,`${p} og:url`);
  }
});

test('privacy and terms carry link-preview tags',()=>{
  for(const p of ['/privacy/','/terms/']){
    const html=read(p);
    assert.equal(meta(html,'property','og:title'),title(html));
    assert.equal(meta(html,'property','og:description'),meta(html,'name','description'));
    assert.equal(meta(html,'property','og:image'),ORIGIN+'/og-image.png');
    assert.equal(meta(html,'name','twitter:card'),'summary_large_image');
  }
});
