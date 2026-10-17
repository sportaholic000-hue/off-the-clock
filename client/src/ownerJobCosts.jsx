import React,{useState} from 'react';
import {api} from './api.js';
import {Button,Field,TextInput,Textarea,Notice,ErrorMessage} from './ui.jsx';
const dollars=value=>value===null||value===undefined?'':(value/100).toFixed(2);
const draftOf=data=>({actualLaborHours:data.actualLaborHours===null?'':String(data.actualLaborHours),actualLaborCost:dollars(data.actualLaborCostCents),actualMaterialCost:dollars(data.actualMaterialCostCents),approvedChanges:data.approvedChanges.map(change=>({amount:dollars(change.amountCents),description:change.description}))});
export function OwnerJobCosts({row}) {
 const [data,setData]=useState(null),[draft,setDraft]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(null),[saved,setSaved]=useState(false);
 const path='/api/owner-records/quotes/'+encodeURIComponent(row.id)+'/job-costs',currency=row.result?.currency||'currency not recorded';
 async function load(){setBusy(true);setError(null);setSaved(false);try{const value=await api(path);setData(value);setDraft(draftOf(value));}catch(next){setError(next);}finally{setBusy(false);}}
 async function save(event){event.preventDefault();setBusy(true);setError(null);setSaved(false);try{const value=await api(path,{method:'PUT',body:{...draft,revision:data.revision}});setData(value);setDraft(draftOf(value));setSaved(true);}catch(next){setError(next);}finally{setBusy(false);}}
 const change=(key,value)=>{setDraft(current=>({...current,[key]:value}));setSaved(false);};
 return <details onToggle={event=>{if(event.currentTarget.open&&!data&&!busy)load();}}><summary>Job costs and approved changes</summary>
  <p>Owner only. These records never appear on the customer quote. Blank means not recorded; enter 0 only for a known zero. Costs and hours cover the whole job, including approved changes. Record costs in the invoice currency, excluding recoverable tax.</p>
  {data&&draft&&<form onSubmit={save}><fieldset disabled={busy} className="calendar-fieldset">
    <p>Final invoice: {data.finalInvoiceCents===null?'Not recorded':currency+' $'+dollars(data.finalInvoiceCents)}. Record the final invoice through the quote action above.</p>
    {['actualLaborHours','actualLaborCost','actualMaterialCost'].map((key,index)=>{const label=['Actual labor hours','Actual labor cost ('+currency+')','Actual material cost ('+currency+')'][index];return <Field key={key} label={label}><TextInput aria-label={label} inputMode="decimal" value={draft[key]} onChange={event=>change(key,event.target.value)}/></Field>;})}
    <h4>Approved change orders</h4><p>Record only changes approved outside the app. Enter their signed invoice amounts on the same tax basis as the final invoice; a negative amount is a credit. Descriptions stay separate from the original quote. Accuracy uses final invoice minus these changes.</p>
    {draft.approvedChanges.map((entry,index)=><section key={index}><Field label={'Change '+(index+1)+' amount ('+currency+')'}><TextInput required aria-label={'Change '+(index+1)+' amount ('+currency+')'} inputMode="decimal" value={entry.amount} onChange={event=>change('approvedChanges',draft.approvedChanges.map((item,n)=>n===index?{...item,amount:event.target.value}:item))}/></Field>
      <Field label={'Change '+(index+1)+' description'}><Textarea required aria-label={'Change '+(index+1)+' description'} maxLength={2000} value={entry.description} onChange={event=>change('approvedChanges',draft.approvedChanges.map((item,n)=>n===index?{...item,description:event.target.value}:item))}/></Field>
      <Button variant="secondary" onClick={()=>change('approvedChanges',draft.approvedChanges.filter((_,n)=>n!==index))}>Remove change {index+1}</Button></section>)}
    <Button variant="secondary" disabled={draft.approvedChanges.length>=100} onClick={()=>change('approvedChanges',[...draft.approvedChanges,{amount:'',description:''}])}>Add approved change</Button>
    <Button type="submit">{busy?'Saving…':'Save job costs'}</Button>
  </fieldset></form>}
  {saved&&<Notice>Job costs saved. Refresh Reports to see the updated figures.</Notice>}<ErrorMessage error={error}/>
  {error&&<Button disabled={busy} variant="secondary" onClick={load}>Reload saved job costs (replace unsaved edits)</Button>}
 </details>;
}
