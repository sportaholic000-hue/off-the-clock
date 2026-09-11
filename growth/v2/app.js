(function(){
'use strict';
const $=id=>document.getElementById(id), M=window.OTCProfitMath, I=window.OTCIntake;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=name=>`<svg width="17" height="17" aria-hidden="true"><use href="#i-${name}"/></svg>`;
let toastTimer;
function announce(s){$('live-status').textContent='';requestAnimationFrame(()=>$('live-status').textContent=s);}
function dismissToast(){$('toast').hidden=true;clearTimeout(toastTimer);}
function toast(s){$('toast').textContent=s;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(dismissToast,5000);}
function downloadText(filename,text){
  try {const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);toast('Download requested. Nothing was sent to Off The Clock AI.');}
  catch {toast('The download could not start. Use Print to keep a copy.');}
}
function printText(title,text){const report=$('print-report');report.replaceChildren();const h=document.createElement('h1');h.textContent=title;const b=document.createElement('p');b.className='print-status';b.textContent='OFF THE CLOCK AI · LOCAL PREVIEW · NOT A CUSTOMER QUOTE';const pre=document.createElement('pre');pre.textContent=text;report.append(h,b,pre);window.print();}
function route(focus=true){
  dismissToast();const raw=location.hash.slice(1);if(raw==='main'){if(focus)$('main').focus();return;}
  const name=['challenge','profit','link'].includes(raw)?raw:'challenge';
  for(const el of document.querySelectorAll('[data-page]'))el.hidden=el.dataset.page!==name;
  for(const el of document.querySelectorAll('[data-nav]')){if(el.dataset.nav===name)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');}
  document.title='Off The Clock AI · '+({challenge:'The QuoteDone Challenge',profit:'Job Profit Check',link:'Your QuoteDone Link'})[name]+' · V2';
  if(focus){window.scrollTo(0,0);document.querySelector(`[data-page="${name}"] h1`).focus({preventScroll:true});}
}
// Dismiss transient UI synchronously, not one hashchange event after a click.
document.addEventListener('click',e=>{const a=e.target.closest('a[href^="#"]');if(a)dismissToast();});
window.addEventListener('hashchange',()=>route(true));
document.querySelector('[data-action="challenge-form"]').addEventListener('click',()=>{
  $('challenge-form').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
  document.querySelector(`#brief-step-${briefStep} h3`).focus({preventScroll:true});
});

// CHALLENGE: progressive brief, not enrollment, a score or an engine test.
let briefStep=1, testKind='typical';
const tests={typical:'Can it use my prices?',extras:'Does it include everything?',unknown:'Does it know when to ask?'};
const tradeHints={
  Roofing:'Name the roof service and material. Distinguish measured roof surface from home floor area.',
  Painting:'Name the surfaces, measured wall/ceiling areas, coats and any trim or preparation.',
  Flooring:'Name the flooring, installation area, removal area and any stairs or subfloor repair.',
  Fencing:'Include fence type, height, measured length, gates and any existing fence removal.',
  Concrete:'Describe the new slab and its measurements. Keep any existing slab demolition separate.',
  Landscaping:'Name the service: mowing, mulch or another job. Include its actual quantities and selected extras.',
  Siding:'Name the siding material, measured wall area, trim and any removal.',
  'Another service':'Describe the service, included items and quantities in the units you actually use.'
};
function briefError(message,id){$('brief-error').textContent=message;$('brief-error').hidden=false;if(id){$(id).setAttribute('aria-invalid','true');$(id).focus();}}
function briefData(){return {trade:$('challenge-trade').value,pricing:$('challenge-pricing').value,test:tests[testKind],scope:$('challenge-scope').value.trim(),known:$('challenge-measurements').value.trim(),unknowns:$('challenge-unknowns').value.trim()};}
function briefText(){const d=briefData();return ['OFF THE CLOCK AI — QUOTEDONE CHALLENGE BRIEF','LOCAL DRAFT — NOT SUBMITTED OR ENROLLED','',`Trade: ${d.trade}`,`Pricing source: ${d.pricing}`,`What to test: ${d.test}`,'','COMPLETE JOB SCOPE',d.scope,'','SUPPLIED MEASUREMENTS / KNOWN DETAILS',d.known||'Not supplied. Measurements remain unknown.','','OPEN QUESTIONS',d.unknowns||'No open questions supplied. This is not confirmation that every required fact is known.','','EVALUATION STANDARD','Check the complete scope, actual measurement units, owner-entered rates, included items, fees, markup, tax, minimums and ranges.','An old invoice is not automatically the correct reference: preserve changes and discounts separately.','Uncertain or unsupported pricing requires review, not a forced price.','','No quote was calculated. No pricing was uploaded. No pilot application was submitted.','Remove private customer information before sharing this file.'].join('\n');}
function summaryRow(label,text,edit){return `<div class="summary-row"><div class="summary-head"><small>${esc(label)}</small>${edit?`<button type="button" data-brief-back="${edit}" aria-label="Edit ${esc(label.toLowerCase())}">Edit</button>`:''}</div><p>${esc(text)}</p></div>`;}
function renderBrief(focus=true){
  for(let n=1;n<=3;n++){$('brief-step-'+n).hidden=n!==briefStep;const p=document.querySelector(`[data-brief-progress="${n}"]`);p.classList.toggle('complete',n<briefStep);if(n===briefStep)p.setAttribute('aria-current','step');else p.removeAttribute('aria-current');}
  $('challenge-step-count').textContent=briefStep+' OF 3';$('selected-test-label').textContent=tests[testKind];$('trade-hint').textContent=tradeHints[$('challenge-trade').value]||'Describe the complete job and the units you use.';
  if(briefStep===3){const d=briefData();$('challenge-result-text').innerHTML=summaryRow('YOUR JOB',d.trade+' · '+d.pricing,1)+summaryRow('WHAT TO TEST',d.test,1)+summaryRow('COMPLETE SCOPE',d.scope,2)+summaryRow('SUPPLIED MEASUREMENTS',d.known||'Not supplied — still unknown.',2)+summaryRow('OPEN QUESTIONS',d.unknowns||'Not supplied. This does not confirm that every required fact is known.',2);}
  $('brief-error').hidden=true;
  if(focus){const h=document.querySelector(`#brief-step-${briefStep} h3`);h.focus({preventScroll:true});h.scrollIntoView({block:'nearest',behavior:'instant'});announce('Brief step '+briefStep+' of 3');}
}
function validateBusiness(){if(!$('challenge-trade').value){briefError('Choose your trade.','challenge-trade');return false;}if(!$('challenge-pricing').value){briefError('Choose where your pricing lives.','challenge-pricing');return false;}return true;}
for(const el of document.querySelectorAll('[data-test]'))el.addEventListener('click',()=>{testKind=el.dataset.test;for(const b of document.querySelectorAll('[data-test]'))b.setAttribute('aria-pressed',String(b===el));$('challenge-purpose').textContent=({typical:'Choose a familiar job. Your brief will keep the scope, known details and open questions together.',extras:'Pick a job where the extras matter. Keep removal, disposal, selected add-ons and fees visible in the test.',unknown:'Pick a job with something unresolved. A useful test must expose the missing fact rather than invent it.'})[testKind];renderBrief(false);});
$('challenge-brief').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.briefNext&&validateBusiness()){briefStep=Number(b.dataset.briefNext);renderBrief();}if(b.dataset.briefBack){briefStep=Number(b.dataset.briefBack);renderBrief();}});
$('challenge-brief').addEventListener('submit',e=>{e.preventDefault();if(briefStep===1){if(validateBusiness()){briefStep=2;renderBrief();}return;}if(!validateBusiness()){briefStep=1;renderBrief();return;}if(!$('challenge-scope').value.trim()){briefError('Describe the job and what should be included.','challenge-scope');return;}briefStep=3;renderBrief();});
$('challenge-brief').addEventListener('input',e=>{e.target.removeAttribute('aria-invalid');$('brief-error').hidden=true;});
$('challenge-trade').addEventListener('change',()=>{ $('challenge-trade').removeAttribute('aria-invalid');$('trade-hint').textContent=tradeHints[$('challenge-trade').value]||'';});
$('challenge-pricing').addEventListener('change',()=>$('challenge-pricing').removeAttribute('aria-invalid'));
$('save-brief').addEventListener('click',()=>{if(briefStep===3)downloadText('QuoteDone_Challenge_Brief_V2.txt',briefText());});
$('print-brief').addEventListener('click',()=>{if(briefStep===3)printText('Your QuoteDone Challenge',briefText());});

// PROFIT: baseline decimal arithmetic is retained; target markup is independent.
let nextId=1, example=true, editedExample=false, latestResult=null, profitMode='check', calculationTimer;
const sample=()=>[{id:nextId++,label:'Labour',quantity:'12.5',rate:'40'},{id:nextId++,label:'Materials',quantity:'1',rate:'600'},{id:nextId++,label:'Haul-away',quantity:'1',rate:'100'},{id:nextId++,label:'Allocated overhead',quantity:'1',rate:'50'}];
let costs=sample();
function drawCosts(){
  $('cost-rows').innerHTML=costs.map((r,i)=>`<div class="cost-row" data-row="${r.id}"><input data-field="label" value="${esc(r.label)}" maxlength="80" aria-label="Cost ${i+1} description" autocomplete="off"><label class="qty-cell"><span class="row-label-mobile">QTY</span><input data-field="quantity" value="${esc(r.quantity)}" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" aria-label="Cost ${i+1} quantity" aria-describedby="row-error-${r.id}"></label><label class="rate-cell"><span class="row-label-mobile">UNIT COST $</span><input data-field="rate" value="${esc(r.rate)}" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" aria-label="Cost ${i+1} unit cost" aria-describedby="row-error-${r.id}"></label><div class="total-cell"><span class="row-label-mobile">TOTAL $</span><output class="row-total" id="cost-total-${r.id}">—</output></div><button class="delete-row" data-remove="${r.id}" type="button" aria-label="Remove cost ${i+1}" ${costs.length===1?'disabled':''}><svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true"><path d="m3 3 8 8M11 3 3 11" stroke="currentColor" stroke-width="1.3"/></svg></button><div class="input-error" id="row-error-${r.id}" hidden></div></div>`).join('');
}
function markEdited(){if(example)editedExample=true;}
function sampleState(){$('example-label').textContent=example?(editedExample?'EDITED EXAMPLE · VERIFY ALL SAMPLE FIGURES':'ILLUSTRATIVE EXAMPLE · REPLACE WITH YOUR FIGURES'):'YOUR FIGURES · NOTHING UPLOADED';$('clear-profit').textContent=example?'Use my own figures':'Load an example';}
function updateMobileResult(){
  const text=$('profit-left').textContent;
  $('mobile-result-label').textContent=profitMode==='check'?'AMOUNT LEFT · '+$('profit-currency').value:'PRICE · '+$('profit-currency').value;
  $('mobile-result-value').textContent=text==='—'?'Complete your inputs':text.length>28?'View exact amount':text;
  clearTimeout(calculationTimer);
  calculationTimer=setTimeout(()=>{if(!$('page-profit').hidden)$('calculation-status').textContent=latestResult?$('mobile-result-label').textContent+' '+text:'Calculation incomplete. '+$('profit-error').textContent;},450);
}
function blankOutputs(){for(const id of ['profit-left','target-left','profit-markup','profit-margin','profit-price','profit-cost','profit-break-even'])$(id).textContent='—';$('profit-caption').textContent='Complete the inputs to see a calculation.';$('cost-segment').style.width='0%';$('left-segment').style.background='var(--line)';$('profit-left').classList.remove('loss');$('save-calculation').disabled=true;$('print-calculation').disabled=true;$('rounding-note').hidden=true;}
function recalc(){
  latestResult=null;sampleState();$('result-currency').textContent=$('profit-currency').value;
  $('price-input-panel').hidden=profitMode!=='check';$('markup-input-panel').hidden=profitMode!=='markup';$('target-price-block').hidden=profitMode!=='markup';$('result-title').textContent=profitMode==='check'?'LEFT AFTER ENTERED COSTS':'PRICE FOR YOUR MARKUP';$('markup-stat-label').textContent=profitMode==='check'?'MARKUP ON ENTERED COSTS':'ACHIEVED MARKUP';$('price-result-label').textContent=profitMode==='check'?'Customer price, before tax':'Calculated price, before tax';
  for(const id of ['selling-price','target-markup'])$(id).removeAttribute('aria-invalid');
  for(const [i,r] of costs.entries()){
    const holder=document.querySelector(`[data-row="${r.id}"]`);$('row-error-'+r.id).hidden=true;
    for(const f of ['quantity','rate'])holder.querySelector(`[data-field="${f}"]`).removeAttribute('aria-invalid');
    try{$('cost-total-'+r.id).textContent=M.money(M.costLine(r,i).cents);}
    catch(error){$('cost-total-'+r.id).textContent='—';$('row-error-'+r.id).textContent=error.message;$('row-error-'+r.id).hidden=false;for(const f of ['quantity','rate'])try{M.decimal(r[f]);}catch{holder.querySelector(`[data-field="${f}"]`).setAttribute('aria-invalid','true');}}
  }
  try{
    latestResult=profitMode==='check'?M.calculate({price:$('selling-price').value,lines:costs}):M.forMarkup({markup:$('target-markup').value,lines:costs});
    const r=latestResult,code=$('profit-currency').value;$('profit-error').hidden=true;
    const amount=profitMode==='check'?r.leftCents:r.priceCents;
    $('profit-left').textContent=(amount<0n?'−$':'$')+M.money(amount<0n?-amount:amount);$('profit-left').classList.toggle('loss',amount<0n);$('target-left').textContent='$'+M.money(r.leftCents);
    $('profit-caption').textContent=profitMode==='markup'?'Before tax. Based only on the costs you entered.':r.leftCents<0n?'Your entered costs exceed this selling price.':r.leftCents===0n?'This price covers the entered costs, with nothing left.':'Before costs or obligations you have not included.';
    $('profit-markup').textContent=r.markup===null?'N/A':r.markup+'%';$('profit-margin').textContent=r.margin===null?'N/A':r.margin+'%';$('profit-price').textContent=code+' $'+M.money(r.priceCents);$('profit-cost').textContent=code+' $'+M.money(r.costCents);$('profit-break-even').textContent=code+' $'+M.money(r.costCents);
    const ratio=r.priceCents>0n?(r.costCents>=r.priceCents?10000n:r.costCents*10000n/r.priceCents):(r.costCents>0n?10000n:0n);
    $('cost-segment').style.width=String(Number(ratio)/100)+'%';$('left-segment').style.background=r.leftCents>0n?'var(--green)':'var(--line)';
    $('save-calculation').disabled=false;$('print-calculation').disabled=false;
    $('rounding-note').hidden=profitMode!=='markup';
    if(profitMode==='markup')$('rounding-note').textContent=r.costCents===0n?'Zero entered costs: markup is undefined and the formula returns $0. This is not a pricing recommendation.':r.roundedUp?'Rounded up to the first whole cent that meets your '+r.requestedMarkup+'% markup. Your original entry is unchanged.':'Your '+r.requestedMarkup+'% markup gives this exact whole-cent price. No extra rounding was needed.';
  }catch(error){blankOutputs();$('profit-error').textContent=error.message;$('profit-error').hidden=false;const field=profitMode==='check'?'selling-price':'target-markup';try{if(profitMode==='check')M.enteredMoney($(field).value,'Selling price');else M.decimal($(field).value,'Your markup');}catch{$(field).setAttribute('aria-invalid','true');}}
  updateMobileResult();
}
$('view-result').addEventListener('click',()=>{const el=$('result-title');el.tabIndex=-1;el.focus({preventScroll:true});document.querySelector('.result-card').scrollIntoView({block:'start',behavior:'instant'});});
if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{$('mobile-result').classList.toggle('result-in-view',entries[0].isIntersecting);},{threshold:0.15});observer.observe(document.querySelector('.result-card'));}
$('cost-rows').addEventListener('input',e=>{const h=e.target.closest('[data-row]');if(!h||!e.target.dataset.field)return;costs.find(r=>r.id===Number(h.dataset.row))[e.target.dataset.field]=e.target.value;markEdited();recalc();});
$('cost-rows').addEventListener('click',e=>{const b=e.target.closest('[data-remove]');if(!b||costs.length===1)return;const n=costs.findIndex(r=>r.id===Number(b.dataset.remove));costs.splice(n,1);markEdited();drawCosts();recalc();const inputs=document.querySelectorAll('[data-field="label"]');inputs[Math.min(n,inputs.length-1)].focus();announce('Cost removed. Calculation updated.');});
$('add-cost').addEventListener('click',()=>{costs.push({id:nextId++,label:'Another cost',quantity:'1',rate:''});markEdited();drawCosts();recalc();$('cost-rows').lastElementChild.querySelector('[data-field="rate"]').focus();});
for(const id of ['selling-price','target-markup'])$(id).addEventListener('input',()=>{markEdited();recalc();});
$('profit-currency').addEventListener('change',()=>{recalc();toast('Currency label changed. Your amounts were not converted.');});
for(const b of document.querySelectorAll('[data-profit-mode]'))b.addEventListener('click',()=>{profitMode=b.dataset.profitMode;for(const c of document.querySelectorAll('[data-profit-mode]'))c.setAttribute('aria-pressed',String(c===b));recalc();announce((profitMode==='markup'?'Set my markup':'Check my price')+' mode. Your cost inputs are preserved.');});
$('clear-profit').addEventListener('click',()=>{$('reset-description').textContent=example?'Start with blank inputs? This removes the sample and any edits. Download your calculation first to keep it.':'Load illustrative figures? This replaces your current inputs. Download your calculation first to keep it.';$('reset-dialog').showModal();});
$('cancel-reset').addEventListener('click',()=>$('reset-dialog').close());
$('confirm-reset').addEventListener('click',()=>{if(example){example=false;editedExample=false;$('selling-price').value='';$('target-markup').value='';costs=[{id:nextId++,label:'Cost',quantity:'1',rate:''}];}else{example=true;editedExample=false;$('selling-price').value='2000';$('target-markup').value='60';costs=sample();}$('reset-dialog').close();drawCosts();recalc();$(profitMode==='check'?'selling-price':'target-markup').focus();});
function calculationText(){const r=latestResult;if(!r)return '';return ['OFF THE CLOCK AI — JOB PROFIT CHECK','LOCAL CALCULATION — NOT A CUSTOMER QUOTE',example?(editedExample?'EDITED ILLUSTRATIVE EXAMPLE — verify all sample figures.':'ILLUSTRATIVE EXAMPLE — not a real business result.'):'USER-ENTERED FIGURES','',`Mode: ${profitMode==='check'?'Check my price':'Set my markup'}`,`Currency: ${$('profit-currency').value} (label only; no conversion)`,...(profitMode==='markup'?[`Requested markup: ${$('target-markup').value}%`]:[`Entered selling price: ${$('selling-price').value}`]),`Selling price before tax: $${M.money(r.priceCents)}`,'','ENTERED COSTS',...r.rows.map(v=>`${v.label}: ${v.quantity} × $${v.rate} = $${M.money(v.cents)}`),'',`Total entered costs: $${M.money(r.costCents)}`,`Amount left: $${M.money(r.leftCents)}`,`Markup on entered costs: ${r.markup===null?'N/A (zero costs)':r.markup+'%'}`,`Margin on entered costs: ${r.margin===null?'N/A (zero price)':r.margin+'%'}`,'','ROUNDING','Quantity × unit cost uses exact decimal strings. Each line rounds once to cents, positive half-cent ties up. Rounded line totals are then added.',...(profitMode==='markup'?['Target price is rounded up to the lowest whole cent meeting the requested markup. With zero costs the percentage is undefined; $0 is not a recommendation.']:[]),'Displayed percentages are rounded to two decimal places; they are not calculation inputs.','','This is not necessarily accounting gross or net profit. Unentered expenses and tax obligations are not included. Nothing was sent or saved to a price book.'].join('\n');}
$('save-calculation').addEventListener('click',()=>{if(latestResult)downloadText('Off_The_Clock_Profit_Check_V2.txt',calculationText());});
$('print-calculation').addEventListener('click',()=>{if(latestResult)printText('Your job profit check',calculationText());});

// QUOTE LINK: service-specific fact collection; deliberately no pricing or submit API.
let journey=I.fresh();
const trade=()=>$('link-trade').value;
function def(){return I.selected(trade(),journey.service);}
function progress(){return `<div class="wizard-progress" aria-hidden="true">${[1,2,3,4].map(i=>`<i class="${journey.step>=i?'done':''}"></i>`).join('')}</div>`;}
function fieldsHTML(){return I.fields(trade(),journey).map(f=>{const a=journey.measurements[f.id]||{};const id='measure-'+f.id;return `<div class="measure-field"><label class="field" for="${id}"><span class="field-title">${esc(f.label)}${f.kind==='number'?' ('+esc(f.unit)+')':''}</span>${f.kind==='text'?`<textarea id="${id}" data-measure="${f.id}" maxlength="1800" rows="2" ${a.unknown?'disabled':''} aria-describedby="note-${f.id}">${esc(a.value||'')}</textarea>`:`<input id="${id}" data-measure="${f.id}" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="${esc(a.value||'')}" ${a.unknown?'disabled':''} aria-describedby="note-${f.id}">`}</label><label class="unknown-control"><input type="checkbox" data-unknown="${f.id}" ${a.unknown?'checked':''}>I don’t know this yet</label><small id="note-${f.id}">${esc(f.help||(f.integer?'Use a whole-number count.':'Supplied information—not independently verified.'))}</small></div>`;}).join('');}
function intakeSummary(){return I.snapshot(trade(),journey,$('link-business').value.trim()||'Your business');}
function measurementText(m){return m.status==='unknown'?'Unknown — needs checking':m.status==='not_supplied'?'Not supplied':m.value+(m.unit==='as described'?'':' '+m.unit)+' · supplied, not independently verified';}
function intakeText(){const d=intakeSummary();return ['QUOTEDONE — LOCAL REQUEST PREVIEW','NOT SUBMITTED — NO LEAD, QUOTE OR BOOKING CREATED','',`Business label: ${d.business}`,`Trade: ${d.trade}`,`Service: ${d.service}`,`Entry source: ${d.source}`,'','JOB SCOPE',d.scope,'','EXTRA SCOPE',...d.extras.map(e=>e.label+': '+e.answer),...(d.method?['',`Measurement method / shape: ${d.method}`]:[]),'','MEASUREMENTS / DETAILS',...d.measurements.map(m=>m.label+': '+measurementText(m)),'',`${d.openItems} unanswered or unknown item(s) in these preview questions.`,`This is not a complete pricing-readiness check. ${d.boundary}`].join('\n');}
function reviewBlock(title,body,action){return `<div class="summary-row"><div class="summary-head"><small>${title}</small><button type="button" data-journey="${action}" aria-label="Edit ${esc(title.toLowerCase())}">Edit</button></div><p>${esc(body)}</p></div>`;}
function showJourney(focus=false){
  $('device-source').textContent='ENTRY: '+journey.source.toUpperCase();let html='';
  if(journey.step===0)html=`<h2>Let’s start with<br>your project.</h2><p>Tell us what you need and what you already know. Missing details can stay unknown.</p><div class="journey-steps"><div><span class="mono">01</span>The service and complete scope.</div><div><span class="mono">02</span>The facts you actually have.</div><div><span class="mono">03</span>A request you can review and edit.</div></div><button class="button primary full" data-journey="start">Start my request ${icon('arrow')}</button><p class="local-boundary">Interactive preview. No request is sent.</p>`;
  else if(journey.step===1)html=`${progress()}<div class="wizard-step"><p class="eyebrow">01 / THE SERVICE</p><h2>What can we help with?</h2>${I.definitions[trade()].map(s=>`<button type="button" class="choice" data-service="${esc(s.name)}" aria-pressed="${journey.service===s.name}">${esc(s.name)} <span aria-hidden="true" style="float:right">→</span></button>`).join('')}<button type="button" class="wizard-back" data-journey="back">← Back</button></div>`;
  else if(journey.step===2)html=`${progress()}<div class="wizard-step"><p class="eyebrow">02 / YOUR ${esc(journey.service.toUpperCase())} REQUEST</p><h2>What’s included?</h2><p>Tell us about the job. Keep selected extras and open questions visible.</p><label class="field"><span class="field-title">Describe the complete job</span><textarea id="journey-scope" maxlength="2500" rows="3" placeholder="Describe the project without personal information.">${esc(journey.scope)}</textarea></label>${def().extras.map(x=>`<div class="scope-option"><fieldset><legend>${esc(x.label)}</legend><div class="tristate">${[['yes','Include'],['no','No'],['unsure','Unsure']].map(([v,t])=>`<button type="button" data-extra="${x.id}" data-answer="${v}" aria-pressed="${journey.extras[x.id]===v}">${t}</button>`).join('')}</div></fieldset></div>`).join('')}<p class="scope-question-note">An unanswered choice stays “Not answered”. It is not treated as “No”.</p><div id="journey-error" class="error" role="alert" hidden></div><button type="button" class="button primary full" data-journey="scope">Add known details ${icon('arrow')}</button><button type="button" class="wizard-back" data-journey="back">← Back to service</button></div>`;
  else if(journey.step===3)html=`${progress()}<div class="wizard-step"><p class="eyebrow">03 / THE KNOWN DETAILS</p><h2>Use what you know.</h2><p>Don’t guess to complete a field. Leave it blank or mark it unknown.</p>${def().methods?`<fieldset class="plain-fieldset method-choices"><legend class="field-title">${esc(def().methodLabel||'How are you measuring it?')}</legend>${def().methods.map(([v,t])=>`<button type="button" class="choice" data-method="${v}" aria-pressed="${journey.method===v}">${esc(t)}</button>`).join('')}</fieldset>`:''}${fieldsHTML()}<div id="journey-error" class="error" role="alert" hidden></div><button type="button" class="button primary full" data-journey="measure">Review my details ${icon('arrow')}</button><button type="button" class="wizard-back" data-journey="back">← Back to scope</button></div>`;
  else if(journey.step===4){const d=intakeSummary();html=`${progress()}<div class="wizard-step"><p class="eyebrow">04 / CHECK YOUR REQUEST</p><h2>Does this look right?</h2>${reviewBlock('SERVICE',d.service,'edit-service')}${reviewBlock('COMPLETE SCOPE',d.scope,'edit-scope')}${d.extras.length?reviewBlock('EXTRA SCOPE',d.extras.map(x=>x.label+': '+x.answer).join('\n'),'edit-scope'):''}${reviewBlock('MEASUREMENTS / DETAILS',(d.method?'Method / shape: '+d.method+'\n':'')+d.measurements.map(m=>m.label+': '+measurementText(m)).join('\n'),'edit-measures')}<span class="gap-count">${d.openItems?`${d.openItems} unanswered or unknown item${d.openItems===1?'':'s'} in these questions.`:'These preview questions have answers. They are not a pricing approval.'}</span><div class="concept-alert"><strong>Preview stops before pricing.</strong><br>No quote is calculated or lead saved. A real request needs the approved workflow and any further job-specific facts.</div><button type="button" class="button primary full" data-journey="finish">Finish preview ${icon('arrow')}</button><button type="button" class="text-button" data-journey="download">Download request preview</button></div>`;}
  else html=`<p class="eyebrow">PREVIEW COMPLETE</p><h2>Your job details.<br>Kept together.</h2><p>That’s the proposed handoff: the service, scope and measurements, with unknowns still visible.</p><div class="concept-alert"><strong>Nothing was submitted.</strong><br>No quote, lead, booking or customer record was created.</div><button type="button" class="button secondary full" data-journey="download">Download request preview</button><button type="button" class="button secondary full" data-journey="edit-review">Return to my details</button><button type="button" class="text-button" data-journey="restart">Start a different request</button>`;
  $('wizard').innerHTML=html;
  if(focus){const h=$('wizard').querySelector('h2');h.tabIndex=-1;h.focus({preventScroll:true});h.scrollIntoView({block:'nearest',behavior:'instant'});announce('Request preview: '+(journey.step===0?'start':journey.step===5?'complete':'step '+journey.step+' of 4'));}
}
function journeyError(message,id){$('journey-error').textContent=message;$('journey-error').hidden=false;if(id){$(id).setAttribute('aria-invalid','true');$(id).focus();}}
$('wizard').addEventListener('input',e=>{if(e.target.id==='journey-scope')journey.scope=e.target.value;if(e.target.dataset.measure)journey.measurements[e.target.dataset.measure]={value:e.target.value,unknown:false};e.target.removeAttribute('aria-invalid');if($('journey-error'))$('journey-error').hidden=true;});
$('wizard').addEventListener('change',e=>{const id=e.target.dataset.unknown;if(id){journey.measurements[id]={unknown:e.target.checked,value:''};showJourney();$('wizard').querySelector(`[data-unknown="${id}"]`).focus();}});
$('wizard').addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.service){if(b.dataset.service!==journey.service){const s=journey.source;journey=I.fresh(s);journey.service=b.dataset.service;}journey.step=2;showJourney(true);return;}
  if(b.dataset.extra){const id=b.dataset.extra;if(journey.extras[id]!==b.dataset.answer){journey.extras[id]=b.dataset.answer;for(const f of def().extras.find(x=>x.id===id).fields)delete journey.measurements[f.id];}showJourney();$('wizard').querySelector(`[data-extra="${id}"][data-answer="${b.dataset.answer}"]`).focus();return;}
  if(b.dataset.method){if(journey.method!==b.dataset.method){const d=def();for(const fields of Object.values(d.methodFields||{}))for(const f of fields)delete journey.measurements[f.id];journey.method=b.dataset.method;}showJourney();$('wizard').querySelector(`[data-method="${journey.method}"]`).focus();return;}
  const a=b.dataset.journey;
  if(a==='download'){downloadText('QuoteDone_Request_Preview_V2.txt',intakeText());return;}
  if(a==='start')journey.step=1;
  else if(a==='back')journey.step=Math.max(0,journey.step-1);
  else if(a==='scope'){if(!journey.scope.trim()){journeyError('Describe the complete job before continuing.','journey-scope');return;}journey.scope=journey.scope.trim();journey.step=3;}
  else if(a==='measure'){
    for(const f of I.fields(trade(),journey)){
      const v=journey.measurements[f.id];if(v?.unknown||!v?.value?.trim()||f.kind==='text')continue;
      try{const d=M.decimal(v.value,f.label);if(d.n===0n)throw Error('Enter a positive '+f.label.toLowerCase()+', or mark it unknown.');if(f.integer&&d.n%d.d!==0n)throw Error(f.label+' must be a whole-number count.');}
      catch(error){journeyError(error.message,'measure-'+f.id);return;}
    }
    journey.step=4;
  }else if(a==='edit-service')journey.step=1;
  else if(a==='edit-scope')journey.step=2;
  else if(a==='edit-measures')journey.step=3;
  else if(a==='edit-review')journey.step=4;
  else if(a==='finish')journey.step=5;
  else if(a==='restart'){journey=I.fresh(journey.source);}
  else return;
  showJourney(true);
});
$('link-business').addEventListener('input',()=>{$('device-business').textContent=$('link-business').value.trim()||'Your business';});
$('link-trade').addEventListener('change',()=>{journey=I.fresh(journey.source);showJourney();announce('Trade changed. The previous service and job details were cleared.');});
for(const b of document.querySelectorAll('[data-channel]'))b.addEventListener('click',()=>{journey.source=b.dataset.channel;for(const c of document.querySelectorAll('[data-channel]'))c.setAttribute('aria-pressed',String(c===b));$('device-source').textContent='ENTRY: '+journey.source.toUpperCase();});
$('focus-link-preview').addEventListener('click',()=>{const h=$('wizard').querySelector('h2');h.tabIndex=-1;h.focus();h.scrollIntoView({block:'center',behavior:'instant'});});
window.addEventListener('beforeprint',()=>{
  const screen=document.querySelector('[data-page]:not([hidden])')?.dataset.page;
  const title=screen==='profit'?'Your job profit check':screen==='link'?'Your request preview':'Your QuoteDone Challenge';
  const text=screen==='profit'?(latestResult?calculationText():'CALCULATION INCOMPLETE. Complete the active price/markup and every cost. No financial result is available.'):
    screen==='link'?(journey.service?intakeText():'No request details yet. Nothing has been submitted.'):briefText();
  const report=$('print-report');report.replaceChildren();const heading=document.createElement('h1');heading.textContent=title;
  const status=document.createElement('p');status.className='print-status';status.textContent='OFF THE CLOCK AI · LOCAL DRAFT · NOT SUBMITTED · NOT A CUSTOMER QUOTE';
  const body=document.createElement('pre');body.textContent=text;report.append(heading,status,body);
});
drawCosts();recalc();renderBrief(false);showJourney();route(false);
})();
