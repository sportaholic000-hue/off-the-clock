import React,{useEffect,useRef,useState} from 'react';
import {api} from './api.js';
import {AppShell,Button,Field,Select,TextInput,Textarea,Notice,ErrorMessage,PageHeader} from './ui.jsx';
import {CustomerMeasurements} from './quoteDoneControls.jsx';
import {submissionCanBeEdited,submissionTooLarge} from './quoteSubmission.js';

export function QuoteAccess(){const [access,setAccess]=useState(null),[origins,setOrigins]=useState(''),[error,setError]=useState(null);useEffect(()=>{api('/api/quotedone/access').then(v=>{setAccess(v);setOrigins(v.allowedOrigins.join('\n'));}).catch(setError);},[]);async function save(){try{const v=await api('/api/quotedone/access',{method:'POST',body:{allowedOrigins:origins.split(/\s+/).filter(Boolean)}});setAccess(v);setError(null);}catch(e){setError(e);}}return <section className="editor-section"><h2>Customer quote link</h2><Field label="Allowed website origins" help="Enter the exact HTTPS website origins. Local HTTP origins are available only for non-production verification."><Textarea value={origins} onChange={e=>setOrigins(e.target.value)}/></Field><Button variant="secondary" onClick={()=>setOrigins(window.location.origin)}>Use this website origin</Button><Button onClick={save}>Save quote-link access</Button>{access?.publicKey&&<p><a href={'/quote/'+access.publicKey} target="_blank" rel="noreferrer">Open customer quote form</a></p>}<ErrorMessage error={error}/></section>;}
export function CustomerQuote({publicKey}){
 const FLOW='job-details-v1';
 const addressLabels={addressLine1:'Project location',addressLine2:'Address line 2',city:'City',region:'State / province',postalCode:'Postal / ZIP code',country:'Country'};
 const [services,setServices]=useState([]),[serviceId,setServiceId]=useState(''),[inputs,setInputs]=useState({}),[contact,setContact]=useState({}),[location,setLocation]=useState({}),[context,setContext]=useState(''),[unknowns,setUnknowns]=useState(''),[urgency,setUrgency]=useState(''),[fees,setFees]=useState({}),[result,setResult]=useState(null),[pending,setPending]=useState(null),[prepared,setPrepared]=useState(null),[restored,setRestored]=useState(null),[legacy,setLegacy]=useState(false),[sending,setSending]=useState(false),[error,setError]=useState(null);
 const cacheKey='quotedone-pending-'+publicKey,inFlight=useRef(false);
 const [requestedService,setRequestedService]=useState(undefined);
 const cache=value=>{try{if(value)sessionStorage.setItem(cacheKey,JSON.stringify(value));else sessionStorage.removeItem(cacheKey);}catch{/* In-memory recovery remains available. */}};
 const text=value=>typeof value==='string'?value:'';
 const shown=value=>value===null||value===undefined?'':typeof value==='object'?JSON.stringify(value):String(value);
 function restore(submission){
  setRequestedService(submission.serviceRequest);
  setRestored(submission);setLegacy(submission.intakeFlow!==FLOW);setServiceId(submission.serviceId||'');setInputs(submission.customerInputs||{});setContact(submission.contact||{});setLocation(submission.location??{});setContext(submission.context??'');setUnknowns(submission.explicitUnknowns??'');setUrgency(submission.urgency??'');setFees(submission.customerFeeSelections||{});
 }
 useEffect(()=>{
  api('/api/public/quote/'+publicKey,{auth:false}).then(v=>setServices(v.services)).catch(setError);
  try{const prior=JSON.parse(sessionStorage.getItem(cacheKey)||'null');if(prior?.kind==='editable')restore(prior.submission);else if(prior?.kind==='prepared'){restore(prior.submission);setPrepared(prior);}else if(prior)setPending(prior);}catch{}
 },[publicKey]);
 const service=services.find(s=>s.id===serviceId);
 function newSubmission(){
  const submission={...restored,requestId:crypto.randomUUID(),serviceId,serviceRequest:requestedService===undefined?service?.name:requestedService,customerInputs:inputs,contact,location,context,explicitUnknowns:unknowns,urgency,customerFeeSelections:fees};
  delete submission.intakeConfirmation;delete submission.reviewRequested;
  delete submission.intakeClarification;
  if(!legacy)submission.intakeFlow=FLOW;
  return submission;
 }
 async function save(submission){
  setPending(submission);setPrepared(null);cache(submission);
  try{
   const response=await api('/api/public/quote/'+publicKey,{method:'POST',body:submission,auth:false});
   if(!['INSTANT_ESTIMATE_READY','ESTIMATE_REQUIRES_REVIEW'].includes(response.resultType)||typeof response.quoteId!=='string')throw new Error('The saved request could not be confirmed. Retry the same request.');
   setResult(response);setPending(null);cache(null);
  }catch(e){
   if(submissionCanBeEdited(e.status)){restore(submission);setPending(null);cache({kind:'editable',submission});}
   setError(e);
  }
 }
 async function send(){
  if(inFlight.current)return;
  const submission=pending||newSubmission();
  if(!pending&&submissionTooLarge(submission)){setError(new Error('Your request is too large. Shorten the additional project details before submitting.'));return;}
  inFlight.current=true;setSending(true);setError(null);
  try{
   if(pending||legacy){await save(submission);return;}
   // Checking details never saves a quote. An uncertain preparation response
   // stays editable; only the actual submission uses immutable retry recovery.
   cache({kind:'editable',submission});
   const details=await api('/api/public/quote/'+publicKey+'/prepare',{method:'POST',body:submission,auth:false});
   if(!['ready','needs_details'].includes(details.status)||!details.summary)throw new Error('The job details could not be checked. Please try again.');
   const value={kind:'prepared',submission,...details};setPrepared(value);cache(value);
  }catch(e){setError(e);}
  finally{inFlight.current=false;setSending(false);}
 }
 async function confirm(){
  if(inFlight.current||!prepared)return;
  inFlight.current=true;setSending(true);setError(null);
  const submission={...prepared.submission,...(prepared.status==='ready'?{intakeConfirmation:prepared.confirmation}:{reviewRequested:true})};
  try{await save(submission);}finally{inFlight.current=false;setSending(false);}
 }
 async function clarify(){
  if(inFlight.current||!prepared)return;
  inFlight.current=true;setSending(true);setError(null);
  const submission={...prepared.submission,intakeClarification:{receipt:prepared.clarification.receipt,answers:prepared.answers||{}}};
  try{
   const details=await api('/api/public/quote/'+publicKey+'/prepare',{method:'POST',body:submission,auth:false});
   if(!['ready','needs_details'].includes(details.status)||!details.summary)throw new Error('The answers could not be checked. Please try again.');
   const value={kind:'prepared',submission,answers:prepared.answers,...details};setPrepared(value);cache(value);
  }catch(e){setError(e);}
  finally{inFlight.current=false;setSending(false);}
 }
 function answer(field,value){const next={...prepared,answers:{...prepared.answers,[field]:value}};setPrepared(next);cache(next);}
 function edit(){
  const submission={...prepared.submission,...(prepared.historyReceipt?{previousIntake:{submission:prepared.submission,receipt:prepared.historyReceipt}}:{})};
  delete submission.intakeClarification;
  restore(submission);cache({kind:'editable',submission});setPrepared(null);setError(null);
 }
 function another(){
  setRequestedService(undefined);
  setResult(null);setInputs({});setServiceId('');setFees({});setContext('');setUnknowns('');setRestored(null);setPrepared(null);
  if(legacy){setContact({email:contact.email,phone:contact.phone});setLocation({});setUrgency('');}
  setLegacy(false);
 }
 const summary=prepared?.summary;
 return <main className="pricebook-page">
  <PageHeader eyebrow="QUOTEDONE" title="Request an estimate" description="Tell us about the work and its measurements. Check the job details before receiving your estimate."/>
  {result?<><QuoteResult result={result}/><Button variant="secondary" onClick={another}>Start another request</Button></>
   :prepared?<section className="editor-section">
    <h2>Check your job details</h2>
    <p>This estimate covers the work listed below. Add any other requested work or uncertain measurements before continuing.</p>
    <h3>{summary.service}</h3>
    {summary.requestedWork!==undefined&&summary.requestedWork!==summary.service&&<p>{shown(summary.requestedWork)}</p>}
    <dl>{summary.facts.map((fact,i)=><React.Fragment key={i}><dt>{fact.label}</dt><dd>{fact.value}</dd></React.Fragment>)}</dl>
    {!!summary.fees.length&&<><h3>Selected charges</h3><dl>{summary.fees.map((fee,i)=><React.Fragment key={i}><dt>{fee.label}</dt><dd>{fee.value}</dd></React.Fragment>)}</dl></>}
    <h3>Contact and site</h3>
    <dl>{Object.entries(summary.contact||{}).map(([key,value])=><React.Fragment key={key}><dt>{key[0].toUpperCase()+key.slice(1)}</dt><dd>{shown(value)||'Not supplied'}</dd></React.Fragment>)}
     {Object.entries(summary.location||{}).map(([key,value])=><React.Fragment key={key}><dt>{addressLabels[key]||key}</dt><dd>{shown(value)||'Not supplied'}</dd></React.Fragment>)}
     <dt>Urgency</dt><dd>{summary.timing}</dd></dl>
    {!!shown(summary.additionalDetails)&&<><h3>Additional project details</h3><p>{shown(summary.additionalDetails)}</p></>}
    {!!shown(summary.unknowns)&&<><h3>Measurements or facts you do not know</h3><p>{shown(summary.unknowns)}</p></>}
    {!!summary.clarifications?.length&&<><h3>Your updated answers</h3><dl>{summary.clarifications.map(item=><React.Fragment key={item.field}><dt>{item.question}</dt><dd>{item.answer}</dd></React.Fragment>)}</dl></>}
    {prepared.status==='needs_details'&&<Notice title="Some details need checking"><ul>{prepared.followUps.map((question,i)=><li key={i}>{question}</li>)}</ul><p>You can update your answers or send the full request to the business for review.</p></Notice>}
    {prepared.status==='needs_details'&&prepared.clarification&&<section aria-label="Clarify job details">
     {prepared.clarification.questions.map(question=><Field key={question.field} label={question.text}><Select aria-label={question.text} value={prepared.answers?.[question.field]||''} onChange={e=>answer(question.field,e.target.value)} disabled={sending}>
      <option value="">Choose an answer</option>{Object.entries(question.options).map(([value,label])=><option key={value} value={value}>{label}</option>)}
     </Select></Field>)}
     <Button onClick={clarify} disabled={sending||prepared.clarification.questions.some(question=>!prepared.answers?.[question.field])}>{sending?'Checking answers':'Check answers'}</Button>
    </section>}
    <Button variant="secondary" onClick={edit} disabled={sending}>Change details</Button>
    <Button onClick={confirm} disabled={sending}>{sending?'Saving request':prepared.status==='ready'?'Get estimate':'Send request for review'}</Button>
   </section>:<>
    {pending?<Notice title="Submission awaiting confirmation">Retry sends the exact same request. It will not create another quote or lead if the first save succeeded.</Notice>:<>
     <Field label="Service"><Select aria-label="Service" value={serviceId} onChange={e=>{if(requestedService===undefined||typeof requestedService==='string'&&requestedService.trim().toLowerCase()===service?.name?.trim().toLowerCase())setRequestedService(undefined);setServiceId(e.target.value);setInputs({});setFees({});}}><option value="">Choose a service</option>{services.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
     {requestedService!==undefined&&<Field label="Requested work" help="Your earlier description is preserved. Correct it here if the work you want has changed."><Textarea aria-label="Requested work" value={shown(requestedService)} onChange={e=>setRequestedService(e.target.value)}/></Field>}
     {service&&<CustomerMeasurements fields={service.customerFields} value={inputs} onChange={setInputs} knownOfferings={service.knownOfferings}/>}
     <section className="editor-section"><h2>Contact and project details</h2>
      <p>Provide an email address or phone number. Your name and address identify you and the job site. Put work requests and uncertain facts in the project fields below.</p>
      {['name','email','phone'].map(field=><Field key={field} label={field[0].toUpperCase()+field.slice(1)}><TextInput value={text(contact[field])} onChange={e=>setContact({...contact,[field]:e.target.value})}/></Field>)}
      {legacy?<Field label="Project location"><TextInput value={text(location)} onChange={e=>setLocation(e.target.value)}/></Field>
       :Object.entries(addressLabels).map(([key,label])=><Field key={key} label={label}><TextInput value={text(location?.[key])} onChange={e=>setLocation({...location,[key]:e.target.value})}/></Field>)}
      <Field label="Measurements or facts you do not know" help="List any required facts that still need checking. Leave this blank if none remain."><Textarea aria-label="Measurements or facts you do not know" value={text(unknowns)} onChange={e=>setUnknowns(e.target.value)}/></Field>
      <Field label="Urgency">{legacy?<TextInput value={text(urgency)} onChange={e=>setUrgency(e.target.value)}/>
       :<Select aria-label="Urgency" value={text(urgency)} onChange={e=>setUrgency(e.target.value)}><option value="">No timing preference</option><option value="flexible">Flexible timing</option><option value="contact_requested">Please contact me about timing</option></Select>}</Field>
      <Field label="Additional project details" help="Include other requested work or details that affect this job. These details can be checked before you send the request to the business."><Textarea aria-label="Additional project details" value={text(context)} onChange={e=>setContext(e.target.value)}/></Field>
      {service?.customerFees?.map(fee=><Field key={fee} label={'Select '+fee+' charge'}><Select aria-label={'Select '+fee+' charge'} value={fees[fee]===undefined?'':String(fees[fee])} onChange={e=>setFees({...fees,[fee]:e.target.value===''?undefined:e.target.value==='true'})}><option value="">Unknown / not supplied</option><option value="true">Yes</option><option value="false">No</option></Select></Field>)}
      {legacy&&<Notice>Your earlier request is preserved for business review. Correct any fields that need changing before submitting.</Notice>}
     </section>
    </>}
    <Button onClick={send} disabled={sending||(!pending&&!serviceId)}>{sending?'Checking request':pending?'Retry saved request':'Submit estimate request'}</Button>
   </>}
   <ErrorMessage error={error}/>
 </main>;
}

export function QuoteResult({result}){if(!result)return null;if(result.resultType==='ESTIMATE_REQUIRES_REVIEW')return <Notice title="Request saved for review">{result.customerMessage}</Notice>;return <section className="editor-section"><h2>Estimate</h2>{result.optionAvailabilityNotice&&<Notice>{result.optionAvailabilityNotice}</Notice>}{(result.options?.length?result.options:[result]).map((o,index)=><article key={index}>{o.tierName&&<h3>{o.tierName}</h3>}<strong>{o.lowEstimate===o.highEstimate?'$'+o.lowEstimate:'$'+o.lowEstimate+' – $'+o.highEstimate}</strong><ul>{(o.priceDrivers||[]).map((driver,i)=><li key={i}>{driver}</li>)}</ul><p>{o.disclaimer||result.disclaimer}</p></article>)}</section>;}
export function QuoteRecords({kind}) {
 const [rows,setRows]=useState([]),[error,setError]=useState(null);
 const load=()=>api('/api/'+kind).then(v=>{setRows(v[kind]);setError(null);}).catch(setError);
 useEffect(()=>{load();},[kind]);
 async function status(id,next){try{await api('/api/leads/'+id,{method:'PATCH',body:{status:next}});await load();}catch(e){setError(e);}}
 return <AppShell activePath={'/'+kind}><main className="pricebook-page"><PageHeader eyebrow="QUOTEDONE" title={kind==='leads'?'Leads':'Quotes'}/><Button variant="secondary" onClick={load}>Refresh</Button>{!rows.length&&<Notice>No saved {kind} yet.</Notice>}{rows.map(row=><section className="editor-section" key={row.id}><h2>{row.describedService||row.serviceType}</h2><p>{row.status} · {row.createdAt}</p>{kind==='leads'?<><dl><dt>Customer</dt><dd>{row.customerName||'Not supplied'}</dd><dt>Phone</dt><dd>{row.callerNumber||'Not supplied'}</dd></dl><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify({contact:row.contact,location:row.location,measurementsAndScope:row.customerInputs,unknowns:row.explicitUnknowns,urgency:row.urgency,context:row.context,clarifications:row.clarifications},null,2)}</pre><Button onClick={()=>status(row.id,row.status==='DISMISSED'?'NEEDS REVIEW':'DISMISSED')}>{row.status==='DISMISSED'?'Reopen for review':'Dismiss'}</Button></>:<QuoteResult result={row.result}/>} {row.internal&&<details><summary>Owner-only calculation and request evidence</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(row.internal,null,2)}</pre></details>}</section>)}<ErrorMessage error={error}/></main></AppShell>;
}
