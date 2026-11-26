import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build} from 'esbuild';

// Re-audit of claude/launch @ dfc8652f (2026-11-25), in real Chromium.
// Live demo: the shipped script runs against a fake local socket and a scripted
// microphone (Chromium's fake capture device). No Gemini session, no network.
// Owner app: the whole app with its stylesheet; the network answers with synthetic data.
// HANDWRITTEN EXPECTATIONS, before execution:
// - demo: 1.5 s of speech, a 0.8 s pause, 1.5 s of speech, then silence: audio frames
//   flow the whole time, no audioStreamEnd is sent during the call, and exactly one is
//   sent when the visitor presses End call;
// - setup step 8 with Google Calendar connected: typing a Calendly link enables Save,
//   and Save sends provider calendly (before: Save stayed disabled);
// - setup step 8 with no calendar and with Calendly saved: Save sends provider calendly,
//   as before;
// - back from Google after Cancel: step 8 shows "Google Calendar wasn't connected. You
//   can try again any time." once (not again on reload); an owner who started on the
//   Calendar page lands there, with the same notice; after connecting, it never shows.
const root=fileURLToPath(new URL('..',import.meta.url));
const require=createRequire(import.meta.url);
const CANCELLED="Google Calendar wasn't connected. You can try again any time.";
let browser;
test.before(async()=>{
  const {chromium}=require(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
  browser={chromium,launch:args=>chromium.launch({headless:true,args,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})})};
});

function speechWav(file){
  const rate=48000,parts=[[1.5,0.3],[0.8,0.012],[1.5,0.3],[4,0]];
  const total=Math.round(parts.reduce((sum,[seconds])=>sum+seconds*rate,0)),pcm=Buffer.alloc(total*2);let i=0;
  for(const [seconds,level] of parts)for(let k=0;k<Math.round(seconds*rate);k++,i++)
    pcm.writeInt16LE(Math.round(level*Math.sin(2*Math.PI*220*i/rate)*32767),i*2);
  const head=Buffer.alloc(44);head.write('RIFF',0);head.writeUInt32LE(36+pcm.length,4);head.write('WAVEfmt ',8);head.writeUInt32LE(16,16);
  head.writeUInt16LE(1,20);head.writeUInt16LE(1,22);head.writeUInt32LE(rate,24);head.writeUInt32LE(rate*2,28);head.writeUInt16LE(2,32);head.writeUInt16LE(16,34);
  head.write('data',36);head.writeUInt32LE(pcm.length,40);writeFileSync(file,Buffer.concat([head,pcm]));
}

test('live demo: a pause mid-sentence does not end the audio stream; End call does',{timeout:120000},async t=>{
  const dir=mkdtempSync(join(tmpdir(),'otc-demo-pause-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const wav=join(dir,'speech.wav');speechWav(wav);
  const script=readFileSync(join(root,'server/public/otc-live-demo.js'));
  const server=createServer((req,res)=>{
    if(req.url.startsWith('/otc-live-demo.js'))return res.writeHead(200,{'content-type':'text/javascript'}).end(script);
    if(req.url.startsWith('/api/demo/session'))return res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({token:'[SYNTHETIC]',model:'synthetic-live-model',sessionSeconds:180,agent:{voice:'Charon'}}));
    res.writeHead(200,{'content-type':'text/html'}).end('<!doctype html><body><section id="demo"><div style="height:420px"><div>Start Live Demo Call</div><div>Demo rules</div></div></section><script src="/otc-live-demo.js" data-ws="ws://127.0.0.1:9/synthetic-live"></script></body>');
  });
  await new Promise(done=>server.listen(0,'127.0.0.1',done));t.after(()=>server.close());
  const b=await browser.launch(['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+wav+'%noloop','--autoplay-policy=no-user-gesture-required']);
  t.after(()=>b.close());
  const page=await (await b.newContext({permissions:['microphone']})).newPage(),errors=[],sent=[];let t0=0;
  page.on('pageerror',e=>errors.push(e.message));
  await page.routeWebSocket(/synthetic-live/,ws=>ws.onMessage(message=>{
    const m=JSON.parse(message),at=Date.now()-t0;
    if(m.setup)return ws.send(JSON.stringify({setupComplete:{}}));
    if(m.realtimeInput?.audioStreamEnd)sent.push({at,end:true});
    else if(m.realtimeInput?.audio){const pcm=Buffer.from(m.realtimeInput.audio.data,'base64');let peak=0;for(let k=0;k<pcm.length;k+=2)peak=Math.max(peak,Math.abs(pcm.readInt16LE(k))/32768);sent.push({at,peak});}
  }));
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  await page.locator('.otcd-start').click();t0=Date.now();
  await page.waitForTimeout(7000);
  const during=sent.slice();
  await page.getByRole('button',{name:'End call'}).click();
  await page.waitForTimeout(300);
  const frames=during.filter(e=>!e.end),loud=frames.filter(e=>e.peak>=0.025);
  assert.ok(loud.length>=20,`speech frames reached the socket (${loud.length})`);
  // The two spoken stretches with the pause between them.
  const firstLoud=frames.findIndex(e=>e.peak>=0.025),lastLoud=frames.length-1-[...frames].reverse().findIndex(e=>e.peak>=0.025);
  assert.ok(frames.slice(firstLoud,lastLoud).some(e=>e.peak<0.025),'the pause between the two spoken stretches was captured');
  assert.deepEqual(during.filter(e=>e.end),[],'no audioStreamEnd during the call');
  // Frames keep flowing through the pause: no gap over 400 ms between consecutive frames.
  for(let k=1;k<frames.length;k++)assert.ok(frames[k].at-frames[k-1].at<400,`gap at ${frames[k-1].at} ms`);
  assert.equal(sent.slice(during.length).filter(e=>e.end).length,1,'one audioStreamEnd when the call ends');
  assert.deepEqual(errors,[]);
});

const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const TOKEN=b64({alg:'HS256'})+'.'+b64({sub:'synthetic-owner',role:'owner',sid:'S'.repeat(43),exp:4102444800})+'.[PLACEHOLDER]';
const fake=(calendar,returnTo)=>`(()=>{const account={firstName:'[PLACEHOLDER] Pat',businessName:'[PLACEHOLDER] Cedar Co',plan:'QuoteDone',planStatus:'trialing',timezone:'America/Moncton',trialNotStarted:false,trialEligible:false};
  const connection=${JSON.stringify(calendar.status==='connected'?{provider:calendar.provider,status:'connected',calendarId:'primary'}:null)};
  const bodies={'/api/onboarding/state':{account,priceBookAccess:true,bookingAccess:true,quoteDoneAccess:true,operator:{missing:[]},preview:{},profile:{onboardingStep:9,knowledgeBase:{about:'x',hours:'x'},calendar:${JSON.stringify(calendar)},businessTypes:['roofing']}},
    '/api/billing/status':{billingEnabled:true,providerAvailable:true,plan:'QuoteDone',planStatus:'trialing',checkoutState:'NONE',canCheckout:false,canManageBilling:true,trialNotStarted:false,trialEligible:false},
    '/api/billing/lifecycle':{notices:[],cancellation:null},'/api/auth/account':{emailVerified:true},
    '/api/calendar/schedule':{canManage:true,connection,timezone:'America/Moncton',range:{fromDate:'2026-11-25'},appointments:[],requests:[],days:[]},
    '/api/calendar/busy':{checkedAt:'2026-11-25T12:00:00.000Z',intervals:[]}};
  window.__posts=[];
  window.fetch=async(url,options)=>{const path=String(url).replace(/^https?:\\/\\/[^/]+/,'').split('?')[0];
    if(options&&options.method==='POST')window.__posts.push({path,body:JSON.parse(options.body||'{}')});
    const body=bodies[path]??{};return {ok:true,status:200,json:async()=>body,blob:async()=>new Blob([])};};
  localStorage.setItem('otc_token',${JSON.stringify(TOKEN)});
  ${returnTo?`sessionStorage.setItem('otc_calendar_return',${JSON.stringify(returnTo)});`:''}})();`;

test('owner app: Calendly Save in setup step 8, and the notice after Cancel on Google',{timeout:180000},async t=>{
  const output=await build({absWorkingDir:root,entryPoints:['client/src/main.jsx'],bundle:true,write:false,platform:'browser',format:'iife',outdir:'out',
    loader:{'.js':'jsx'},define:{'process.env.NODE_ENV':'"development"','import.meta.env':'{}'},logLevel:'silent'});
  const js=output.outputFiles.find(f=>f.path.endsWith('.js')).text,css=output.outputFiles.find(f=>f.path.endsWith('.css')).text;
  const b=await browser.launch([]);t.after(()=>b.close());
  async function open(path,calendar,returnTo){
    const page=await b.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route(/fonts\.(googleapis|gstatic)\.com/,route=>route.abort());
    await page.route('https://synthetic.invalid/**',route=>route.fulfill({contentType:'text/html',
      body:`<!doctype html><html><head><style>${css}</style></head><body><div id="root"></div><script>${fake(calendar,returnTo)}</script><script>${js}</script></body></html>`}));
    await page.goto('https://synthetic.invalid'+path);
    return {page,errors};
  }
  for(const calendar of [{},{provider:'calendly',status:'connected',calendlyUrl:'https://calendly.com/synthetic-old'},{provider:'google',status:'connected'}]){
    const {page,errors}=await open('/onboarding?step=8',calendar);
    await page.getByText('Add the scheduling link your business already uses').waitFor();
    const save=page.getByRole('button',{name:'Save',exact:true});
    await page.locator('input[type=url]').fill('');
    assert.equal(await save.isDisabled(),true,'Save waits for a link');
    await page.locator('input[type=url]').fill('https://calendly.com/synthetic-new');
    assert.equal(await save.isDisabled(),false,`Save enabled with ${JSON.stringify(calendar)}`);
    await save.click();
    await page.waitForFunction(()=>window.__posts.some(p=>p.path==='/api/onboarding/calendar'));
    const posts=await page.evaluate(()=>window.__posts.filter(p=>p.path==='/api/onboarding/calendar').map(p=>p.body));
    assert.deepEqual(posts,[{provider:'calendly',calendlyUrl:'https://calendly.com/synthetic-new',skipped:false}]);
    assert.deepEqual(errors,[]);await page.close();
  }
  // Cancel on Google, started from setup.
  {const {page,errors}=await open('/onboarding?step=8&calendar=cancelled',{});
    await page.getByText(CANCELLED).waitFor();
    assert.equal(new URL(page.url()).pathname,'/onboarding');
    await page.reload();await page.getByText('Add the scheduling link your business already uses').waitFor();await page.waitForTimeout(500);
    assert.equal(await page.getByText(CANCELLED).count(),0,'shown once');
    assert.deepEqual(errors,[]);await page.close();}
  // Cancel on Google, started from the Calendar page.
  {const {page,errors}=await open('/onboarding?step=8&calendar=cancelled',{},'calendar');
    await page.getByText(CANCELLED).waitFor();
    assert.equal(await page.evaluate(()=>location.pathname+location.search),'/calendar');
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('otc_calendar_return')),null);
    // Shown once: a reload of the page does not show it again.
    await page.reload();await page.getByRole('heading',{name:'Calendar'}).first().waitFor();await page.waitForTimeout(500);
    assert.equal(await page.getByText(CANCELLED).count(),0);
    assert.deepEqual(errors,[]);await page.close();}
  // Connected from the Calendar page: lands there as before, no cancel notice.
  {const {page,errors}=await open('/onboarding?step=8&calendar=connected',{provider:'google',status:'connected'},'calendar');
    await page.getByRole('heading',{name:'Calendar'}).first().waitFor();
    assert.equal(await page.evaluate(()=>location.pathname+location.search),'/calendar');
    assert.equal(await page.getByText(CANCELLED).count(),0);assert.deepEqual(errors,[]);await page.close();}
  // Connected from setup: "Calendar connected." and no cancel notice.
  {const {page,errors}=await open('/onboarding?step=8&calendar=connected',{provider:'google',status:'connected'});
    await page.getByText('Calendar connected.').waitFor();
    assert.equal(await page.getByText(CANCELLED).count(),0);assert.deepEqual(errors,[]);await page.close();}
});
