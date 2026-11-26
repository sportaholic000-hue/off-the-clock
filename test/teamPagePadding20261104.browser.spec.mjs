import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

// The Team page uses the same page padding as the other owner pages.
// Real compiled Team, Reports and AppShell with the real owner stylesheet; synthetic transport only.
const root=fileURLToPath(new URL('..',import.meta.url));

test('Team page has the same top gap and left gutter as other owner pages',{timeout:90000},async t=>{
  const output=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',outdir:'out',
    define:{'process.env.NODE_ENV':'"development"'},
    plugins:[{name:'synthetic-api',setup(b){b.onLoad({filter:/[\\/]client[\\/]src[\\/]api\.js$/},()=>({loader:'js',contents:
      'export const api=(...args)=>window.__transport(...args);export const go=()=>{};export const logout=async()=>{};export const getToken=()=>null;'}));}}],
    stdin:{resolveDir:root,loader:'jsx',contents:`import React from 'react';import {createRoot} from 'react-dom/client';
      import './client/src/styles.css';import Team from './client/src/team.jsx';import Reports from './client/src/reports.jsx';
      window.__transport=async path=>{if(path==='/api/team/staff')return {plan:'Operator',limit:1,staff:[]};throw Error('[PLACEHOLDER] unavailable');};
      createRoot(document.getElementById('root')).render(location.hash==='#reports'?<Reports/>:<Team/>);`}});
  const js=output.outputFiles.find(f=>f.path.endsWith('.js')).text,css=output.outputFiles.find(f=>f.path.endsWith('.css')).text;
  const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
  const browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});
  t.after(()=>browser.close());
  async function measure(width,hash){
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://synthetic.invalid/**',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`}));
    await page.goto('https://synthetic.invalid/app'+hash);
    await page.locator('main .page-header h1').waitFor();
    const box=await page.evaluate(()=>{const main=document.querySelector('main'),style=getComputedStyle(main),h=main.querySelector('.page-header').getBoundingClientRect(),m=main.getBoundingClientRect();
      return {top:parseFloat(style.paddingTop),left:parseFloat(style.paddingLeft),right:parseFloat(style.paddingRight),headerTop:h.top-m.top,headerLeft:h.left-m.left};});
    assert.deepEqual(errors,[]);await page.close();return box;
  }
  for(const width of [1280,390]){
    const team=await measure(width,''),reports=await measure(width,'#reports');
    assert.ok(team.top>=16&&team.left>=16,`Team has page padding at ${width}px: ${JSON.stringify(team)}`);
    assert.deepEqual({top:team.top,left:team.left,right:team.right},{top:reports.top,left:reports.left,right:reports.right},`Team padding matches Reports at ${width}px`);
    assert.equal(team.headerLeft,team.left,'header starts at the gutter, not against the sidebar');
    assert.ok(team.headerTop>=team.top,'header starts below the top gap');
  }
});
