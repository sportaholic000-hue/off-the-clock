// Executes the unchanged production React app against real local billing/voice routes.
// This is DOM evidence, NOT a browser screenshot or a visual/layout test.
import {buildUi,startHarness,folder,START,A,B,until} from './harness.mjs';
import {JSDOM,VirtualConsole} from 'jsdom';
import {webcrypto} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
const dist=await buildUi(),bundle=readFileSync(path.join(dist,'assets/main.js'),'utf8');
const evidence=path.join(folder,'evidence');mkdirSync(evidence,{recursive:true});
const save=(name,value)=>writeFileSync(path.join(evidence,name),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');
const results=[];
const row=(step,pass,observed)=>{results.push({step,result:pass?'PASS':'FAIL',observed,screenshot:null,evidenceMode:'real React DOM + local HTTP, browser unavailable'});save('results.json',results);console.log(step,pass?'PASS':'FAIL',JSON.stringify(observed));};

async function screen(h,owner=A){
  const requests=[],errors=[],virtualConsole=new VirtualConsole();
  virtualConsole.on('jsdomError',error=>errors.push(error.message));
  const dom=new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>',{
    url:h.origin+'/settings/billing',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole,
    beforeParse(window){
      window.localStorage.setItem('otc_token',h.tokens[owner]);
      Object.defineProperty(window,'crypto',{value:webcrypto});
      window.TextEncoder=TextEncoder;window.TextDecoder=TextDecoder;window.structuredClone=structuredClone;
      const OriginalDate=window.Date;
      window.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:[Date.parse(START)]));}static now(){return Date.parse(START);}};
      window.fetch=async(input,options)=>{
        const url=new URL(input,h.origin);if(url.origin!==h.origin)throw Error('External network forbidden');
        const record={path:url.pathname,method:options?.method||'GET'};requests.push(record);
        const response=await fetch(url,options);record.status=response.status;return response;
      };
    }
  });
  dom.window.eval(bundle);
  const doc=dom.window.document,text=()=>doc.body.textContent.replace(/\s+/g,' ').trim();
  const button=()=>[...doc.querySelectorAll('button')].find(b=>b.textContent==='Refresh billing status');
  await until(()=>button()&&!button().disabled,'Billing React mount');
  return {dom,doc,text,requests,errors,button,
    async refresh(){
      const count=requests.length;button().click();
      // Wait for BOTH real responses and React's completed render; counting a
      // request alone can observe the previous button before busy commits.
      await until(()=>requests.length>=count+2&&requests.slice(count).every(r=>Number.isInteger(r.status))&&button()&&!button().disabled,'Billing refresh');
    },
    async select(label,value){const input=doc.querySelector('select[aria-label="'+label+'"]');if(!input)throw Error('Missing selection: '+label);input.value=value;input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await new Promise(resolve=>setImmediate(resolve));},
    snapshot(name){save(name+'.txt',text()+'\n');save(name+'.html',dom.serialize());return text();},
    close(){dom.window.close();}};
}

const h=await startHarness({dist});let page,chooser,disabled,disabledPage;
try{
  const webhook=await h.setTrial();if(webhook.status!==200)throw Error('Synthetic trial webhook failed: '+JSON.stringify(webhook));
  page=await screen(h);
  const status=await h.api('/api/billing/status'),usage=h.usage(),initialText=page.snapshot('01-trial-page');
  const trialObserved={status,usage,screen:initialText,webhookStatus:webhook.status,
    showsTrial:page.doc.querySelector('[aria-label="Current subscription"]')?.textContent.includes('Trial'),
    showsDaysLeft:/\b14\s+days?\s+(?:left|remaining)\b/i.test(initialText),
    showsTrialCap:/\b60[- ]minute|\b60\s+(?:included |trial )?minutes/i.test(initialText),
    showsUsage:/minutes used/i.test(initialText),
    apiHasUsage:['minutesUsed','includedMinutes','minutesLeft'].every(key=>key in status.body)};
  save('01-initial-api.json',{webhook,status,usage,errors:h.errors});
  row('1. Fresh trial',status.status===200&&trialObserved.showsTrial&&trialObserved.showsDaysLeft&&trialObserved.showsTrialCap&&trialObserved.showsUsage&&trialObserved.apiHasUsage,trialObserved);
  // --initial-only is a publish checkpoint, not a substitute for remaining checks.
  if(!process.argv.includes('--initial-only')){
    const incoming=await h.connect();await h.finishMedia();
    await page.refresh();
    const pending={incoming,status:await h.api('/api/billing/status'),usage:h.usage(),screen:page.snapshot('02-pending-page')};
    save('02-pending-call.json',pending);
    row('2. Pending call',pending.usage.snapshot.unconfirmedCalls===1&&/duration.*(?:pending|confirm)|(?:pending|confirm).*duration/i.test(pending.screen),pending);
    const completion=await h.complete();await page.refresh();
    const completed={completion,status:await h.api('/api/billing/status'),usage:h.usage(),screen:page.snapshot('03-completed-page')};
    save('03-completed-call.json',completed);
    row('3. Completed 125-second call',completion.status===204&&completed.usage.snapshot.minutesUsed===3&&completed.usage.snapshot.minutesLeft===57&&/minutes used/i.test(completed.screen)&&/\b57\b/.test(completed.screen),completed);
    const region=()=>page.doc.querySelector('[aria-label="Current subscription"]').textContent;
    const refreshBefore=region(),change=await h.setTrial('QuoteDone'),authoritativeStatus=await h.api('/api/billing/status'),beforeClick=region();
    const getsBefore=page.requests.filter(r=>r.path==='/api/billing/status').length;
    await page.refresh();const refreshAfter=region(),getsAfter=page.requests.filter(r=>r.path==='/api/billing/status').length;
    const refresh={refreshBefore,beforeClick,refreshAfter,changeStatus:change.status,authoritativeStatus,getsBefore,getsAfter,requests:page.requests,screen:page.snapshot('04-refreshed-page')};
    save('04-refresh.json',refresh);
    row('4. Refresh billing status',change.status===200&&authoritativeStatus.body.plan==='QuoteDone'&&/Operator/.test(beforeClick)&&/QuoteDone/.test(refreshAfter)&&getsAfter===getsBefore+1,refresh);
    chooser=await screen(h,B);
    for(const interval of ['monthly','annual']){
      const selections=[];
      for(const plan of ['Starter','Operator','QuoteDone']){
        await chooser.select('Plan',plan);await chooser.select('Billing interval',interval);
        const screenText=chooser.snapshot('05-'+interval+'-'+plan.toLowerCase());
        selections.push({plan,interval,selectedPlan:chooser.doc.querySelector('select[aria-label="Plan"]').value,
          selectedInterval:chooser.doc.querySelector('select[aria-label="Billing interval"]').value,screen:screenText});
      }
      const allText=selections[0].screen;
      const pricesShown=interval==='monthly'?['$69 monthly','$119 monthly','$279 monthly'].every(t=>allText.includes(t)):['$690 for 12 months','$1,190 for 12 months','$2,790 for 12 months'].every(t=>allText.includes(t));
      const quotasShown=['150','300','1,200'].every(t=>allText.includes(t));
      const observed={status:await h.api('/api/billing/status',B),selections,pricesShown,quotasShown,
        overageShown:allText.includes('$0.35/min')&&allText.includes('$25'),monthlyResetShown:allText.includes('Annual plans receive monthly minutes')};
      save('05-'+interval+'-choices.json',observed);
      row(interval==='monthly'?'5. Monthly plan choices':'6. Annual plan choices',pricesShown&&quotasShown&&observed.overageShown&&selections.every(s=>s.plan===s.selectedPlan&&s.interval===s.selectedInterval),observed);
    }
    // Registered trial owners DO see quotas in Plan features. Preserve this
    // counterexample so the missing quotas are not incorrectly reported as universal.
    save('05-existing-trial-plan-features.txt',page.doc.querySelector('[aria-label="Manage subscription"]').textContent+'\n');
    disabled=await startHarness({stripeEnabled:false,dist});disabledPage=await screen(disabled);
    const off={status:await disabled.api('/api/billing/status'),lifecycle:await disabled.api('/api/billing/lifecycle'),
      screen:disabledPage.snapshot('06-stripe-disabled-page'),currentSubscriptionPresent:!!disabledPage.doc.querySelector('[aria-label="Current subscription"]'),
      refreshPresent:!!disabledPage.button(),requests:disabledPage.requests};
    save('06-stripe-disabled.json',off);
    row('7. Stripe disabled comparison',off.status.status===404&&off.status.body.error==='Not found'&&off.screen.includes('Billing is not configured yet.')&&!off.currentSubscriptionPresent,off);
  }
  save('execution-safety.json',{node:process.version,realProviderOperations:0,unexpectedProviderWrites:h.providerWrites,fixtureWrites:h.f.fakes.writes,
    googleLiveConnections:h.connects.length,voiceErrors:h.errors,reactErrors:page.errors,chooserErrors:chooser?.errors||[],requests:h.requests,
    finalUsage:h.usage(),disabledRequests:disabled?.requests||[],note:'No background workers started; Google/Twilio/Stripe clients are injected fakes. Auth is a synthetic fixture middleware, not an authentication test.'});
  console.log(JSON.stringify({total:results.length,passed:results.filter(r=>r.result==='PASS').length,failed:results.filter(r=>r.result==='FAIL').length,screenshots:0}));
  if(results.some(r=>r.result==='FAIL'))process.exitCode=1;
}catch(error){save('harness-error.json',{message:error.message,stack:error.stack,voiceErrors:h.errors,requests:h.requests});throw error;}
finally{page?.close();chooser?.close();disabledPage?.close();await disabled?.close();await h.close();}
