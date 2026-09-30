import {customerFieldVisible} from '../../server/scopeConfiguration.js';
import React,{useEffect,useRef,useState} from 'react';
import {Field,Select,TextInput,Button,Notice,Textarea,ErrorMessage} from './ui.jsx';
import {ExactNumericInput} from './pricebookInputs.jsx';
import {parseOwnerNumericInput} from '../../server/priceBookMoney.js';
import {api} from './api.js';
const human=value=>String(value).replaceAll('_',' ');
const own=(value,key)=>Object.hasOwn(value||{},key);

export function PricingTree({value,onChange,definition,level=1,label=definition.label}) {
 const tree=definition.tree||{},depth=tree.depth||1;
 const map=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
 const [newKey,setNewKey]=useState('');
 const keys=[...new Set([...Object.keys(map),...(level===depth?tree.leafKeys||[]:[])])];
 const update=(key,item)=>{const next={...map};if(item===undefined)delete next[key];else next[key]=item;onChange(next);};
 return <div className="field-stack">{keys.map(key=><div key={key}>
  {level<depth?<><strong>{human(key)}</strong><PricingTree value={map[key]} onChange={v=>update(key,v)} definition={definition} level={level+1} label={label+' '+human(key)}/></>:
   <Field label={human(key)}>{tree.leafType==='enum'?<Select aria-label={label+' '+human(key)} value={map[key]??''} onChange={e=>update(key,e.target.value||undefined)}><option value="">Choose</option>{tree.options.map(v=><option key={v} value={v}>{human(v)}</option>)}</Select>:
    tree.leafType==='boolean'?<Select aria-label={label+' '+human(key)} value={map[key]===undefined?'':String(map[key])} onChange={e=>update(key,e.target.value===''?undefined:e.target.value==='true')}><option value="">Choose</option><option value="true">Yes</option><option value="false">No</option></Select>:
    <ExactNumericInput aria-label={label+' '+human(key)} value={map[key]} kind={tree.leafMoneyKinds?.[key]??definition.moneyKind} onChange={v=>update(key,v)}/>}</Field>}
   <Button variant="quiet" onClick={()=>update(key,undefined)}>Remove {human(key)}</Button>
 </div>)}{!(level===depth&&tree.leafKeys)&&<div className="field-stack"><TextInput aria-label={label+' offering key'} value={newKey} onChange={e=>setNewKey(e.target.value)}/><Button variant="secondary" onClick={()=>{if(/^[a-z][a-z0-9_]*$/.test(newKey)&&!own(map,newKey)){update(newKey,level<depth?{}:null);setNewKey('');}}}>Add offering</Button><small>Use the exact offering key consistently across the related price maps.</small></div>}</div>;
}

// Coordinates may be negative. Reuse the exact decimal parser for the magnitude;
// never turn an incomplete or unrepresentable entry into a previous valid point.
function parseCoordinate(raw) {
 const text=String(raw??'').trim();
 if(!text)return undefined;
 const negative=text.startsWith('-'),magnitude=negative?text.slice(1):text;
 if(negative&&(!magnitude||/^[+\s-]/.test(magnitude)))throw Error('Enter a finite decimal coordinate.');
 const number=parseOwnerNumericInput(magnitude);
 if(number===undefined)throw Error('Enter a finite decimal coordinate.');
 return negative?-number:number;
}
function CoordinateInput({value,onChange,...props}) {
 const [raw,setRaw]=useState(value===undefined?'':String(value)),[error,setError]=useState(''),emitted=useRef(value);
 useEffect(()=>{const text=value===undefined?'':String(value);if(!Object.is(value,emitted.current)){emitted.current=value;setRaw(text);}try{parseCoordinate(text);setError('');}catch(e){setError(e.message);}},[value]);
 function change(text){setRaw(text);try{const next=parseCoordinate(text);setError('');emitted.current=next;onChange(next);}catch(e){setError(e.message);emitted.current=text;onChange(text);}}
 return <><TextInput {...props} type="text" inputMode="decimal" value={raw} aria-invalid={Boolean(error)} onChange={e=>change(e.target.value)}/>{error&&<span className="field-error" role="alert">{error}</span>}</>;
}
function MeasuredOutline({field,value,onChange}) {
 const points=Array.isArray(value)?value:[];
 function edit(index,axis,next){onChange(points.map((point,i)=>{if(i!==index)return point;const updated={...point};if(next===undefined)delete updated[axis];else updated[axis]=next;return updated;}));}
 return <div className="field-stack"><small>Enter every measured corner in order, in feet, then repeat the first point to close the outline. Use straight horizontal or vertical edges only. Negative coordinates are allowed. Missing or conflicting measurements require review.</small>
 {points.map((point,i)=><div key={i} className="field-stack">{['x','y'].map(axis=><Field key={axis} label={'Point '+(i+1)+' '+axis.toUpperCase()+' (ft)'}><CoordinateInput aria-label={field.label+' point '+(i+1)+' '+axis.toUpperCase()+' (ft)'} value={point[axis]} onChange={next=>edit(i,axis,next)}/></Field>)}<Button variant="quiet" onClick={()=>onChange(points.filter((_,index)=>index!==i))}>Remove point {i+1}</Button></div>)}
 <Button variant="secondary" onClick={()=>onChange([...points,{}])}>Add measured point</Button></div>;
}

export function CustomerMeasurements({fields=[],value={},onChange,knownOfferings={}}) {
 const update=(name,next)=>{const updated={...value};if(next===undefined)delete updated[name];else updated[name]=next;
  if(own(updated.confirmedFacts,name)){updated.confirmedFacts={...updated.confirmedFacts};delete updated.confirmedFacts[name];if(!Object.keys(updated.confirmedFacts).length)delete updated.confirmedFacts;}
  onChange(updated);
 };
 return <div className="field-stack">{fields.filter(f=>f.type!=='confirmed_facts'&&customerFieldVisible(f,value)).map(f=><div key={f.name} className="field"><span className="field-label">{f.label}</span>{f.unit&&<span className="field-help">{f.unit}</span>}{f.details?.map((detail,i)=><p className="field-help" key={i}>{detail}</p>)}
  {f.type==='boolean'?<Select aria-label={f.label} value={value[f.name]===undefined?'':String(value[f.name])} onChange={e=>update(f.name,e.target.value===''?undefined:e.target.value==='true')}><option value="">Unknown / not supplied</option><option value="true">Yes</option><option value="false">No</option></Select>:
   f.type==='enum'?<Select aria-label={f.label} value={value[f.name]??''} onChange={e=>update(f.name,e.target.value===''?undefined:f.values.find(v=>String(v)===e.target.value))}><option value="">Unknown / not supplied</option>{(f.values||[]).map(v=><option key={v} value={v}>{human(v)}</option>)}</Select>:
   f.type==='integer_or_unknown'?<Select aria-label={f.label} value={value[f.name]??''} onChange={e=>update(f.name,e.target.value===''?undefined:e.target.value==='unknown'?'unknown':Number(e.target.value))}><option value="">Not supplied</option><option value="unknown">Unknown — requires review</option>{Array.from({length:f.max-f.min+1},(_,i)=>f.min+i).map(n=><option key={n} value={n}>{n}</option>)}</Select>:
   f.type==='orthogonal_outline'?<MeasuredOutline field={f} value={value[f.name]} onChange={v=>update(f.name,v)}/>:
   f.type==='string'?<TextInput aria-label={f.label} value={value[f.name]??''} onChange={e=>update(f.name,e.target.value||undefined)}/>:
   f.type==='offering_counts'?<>{(f.values||[]).map(key=><Field key={key} label={f.options?.[key]||human(key)}><ExactNumericInput aria-label={'Gate count '+key} value={value[f.name]?.[key]} onChange={v=>{const next={...(value[f.name]||{})};if(v===undefined)delete next[key];else next[key]=v;update(f.name,next);}}/></Field>)}<Button variant="secondary" onClick={()=>update(f.name,{})}>No gates</Button>{value[f.name]&&Object.values(value[f.name]).every(n=>n===0)&&<span>No gates selected</span>}</>:
   f.type==='plant_counts'?<>{['small','medium','large'].map(size=><Field key={size} label={human(size)}><ExactNumericInput aria-label={f.label+' '+human(size)} value={value[f.name]?.[size]} onChange={v=>{const next={...(value[f.name]||{})};if(v===undefined)delete next[size];else next[size]=v;update(f.name,next);}}/></Field>)}</>:
   f.type==='slug'?<><TextInput aria-label={f.label} list={'offerings-'+f.name} value={value[f.name]??''} onChange={e=>update(f.name,e.target.value||undefined)}/><datalist id={'offerings-'+f.name}>{Object.keys(knownOfferings[f.name]||{}).map(key=><option key={key} value={key}/>)}</datalist>{knownOfferings[f.name]?.[value[f.name]]&&<label><input type="checkbox" checked={value.confirmedFacts?.[f.name]?.value===value[f.name]} onChange={e=>{const confirmedFacts={...(value.confirmedFacts||{})};if(e.target.checked)confirmedFacts[f.name]={field:f.name,value:value[f.name],status:'identified',offeringId:knownOfferings[f.name][value[f.name]]};else delete confirmedFacts[f.name];onChange({...value,confirmedFacts});}}/> I have identified this exact offering.</label>}</>:
   f.type==='number'?<ExactNumericInput aria-label={f.label} value={value[f.name]} onChange={v=>update(f.name,v)}/>:<Notice>This measurement requires owner review.</Notice>}
 </div>)}</div>;
}

export function ServiceRules({service,meta,categories=[],feeNames=[],feeModes=[],defaults,onService,onDefault}) {
 const [offering,setOffering]=useState({});
 const label=name=>meta.ruleFields?.find(f=>f.field===name)?.label||name;
 const setMap=(name,key,value)=>onService({...service,[name]:{...(service[name]||{}),[key]:value}});
 return <section className="editor-section"><h2>Quote configuration</h2>
  <p>Choose each rate meaning, tax treatment and charge rule. Missing decisions keep customer requests in review.</p>
  <div className="matrix-scroll"><table className="pricing-matrix"><thead><tr><th>Category</th><th>{label('priceBasisByCategory')}</th><th>{label('taxabilityByCategory')}</th><th>Apply markup / margin</th></tr></thead><tbody>{categories.map(category=><tr key={category}><th>{human(category)}</th><td><Select aria-label={category+' price basis'} value={service.priceBasisByCategory?.[category]||''} onChange={e=>setMap('priceBasisByCategory',category,e.target.value)}><option value="">Choose</option><option value="cost">Owner cost</option><option value="sell_price">Final sell price</option></Select></td><td><Select aria-label={category+' taxability'} value={service.taxabilityByCategory?.[category]===undefined?'':String(service.taxabilityByCategory[category])} onChange={e=>setMap('taxabilityByCategory',category,e.target.value===''?undefined:e.target.value==='true')}><option value="">Choose</option><option value="true">Taxable</option><option value="false">Not taxable</option></Select></td><td><Select aria-label={category+' markup applies'} value={defaults.markupApplies?.[category]===undefined?'':String(defaults.markupApplies[category])} onChange={e=>onDefault('markupApplies',{...(defaults.markupApplies||{}),[category]:e.target.value===''?undefined:e.target.value==='true'})}><option value="">Choose</option><option value="true">Yes</option><option value="false">No</option></Select></td></tr>)}</tbody></table></div>
  <h3>{label('feeRules')}</h3>{feeNames.map(fee=><Field key={fee} label={human(fee)}><Select aria-label={fee+' fee rule'} value={service.feeRules?.[fee]||''} onChange={e=>setMap('feeRules',fee,e.target.value)}><option value="">Choose</option>{feeModes.map(mode=><option key={mode} value={mode}>{human(mode)}</option>)}</Select>{service.feeRules?.[fee]==='owner_selected'&&<Field label="Apply this owner-selected fee"><Select value={service.ownerFeeSelections?.[fee]===undefined?'':String(service.ownerFeeSelections[fee])} onChange={e=>setMap('ownerFeeSelections',fee,e.target.value===''?undefined:e.target.value==='true')}><option value="">Choose</option><option value="true">Yes</option><option value="false">No</option></Select></Field>}</Field>)}
  {meta.customerFields?.some(f=>f.type==='slug')&&<><h3>{label('knownOfferings')}</h3><p>Register only offerings you actually recognize. Adding a pricing key does not register or identify an offering.</p>{meta.customerFields.filter(f=>f.type==='slug').map(f=><div key={f.name}><strong>{f.label}</strong>{Object.entries(service.knownOfferings?.[f.name]||{}).map(([key,id])=><p key={key}>{key} <small>{id}</small> <Button variant="quiet" onClick={()=>{const entries={...service.knownOfferings[f.name]};delete entries[key];onService({...service,knownOfferings:{...service.knownOfferings,[f.name]:entries}});}}>Remove</Button></p>)}<TextInput aria-label={f.label+' offering key'} value={offering[f.name]||''} onChange={e=>setOffering({...offering,[f.name]:e.target.value})}/><Button variant="secondary" onClick={()=>{const key=offering[f.name];if(/^[a-z][a-z0-9_]*$/.test(key)&&!own(service.knownOfferings?.[f.name],key)){onService({...service,knownOfferings:{...(service.knownOfferings||{}),[f.name]:{...(service.knownOfferings?.[f.name]||{}),[key]:crypto.randomUUID()}}});setOffering({...offering,[f.name]:''});}}}>Register offering</Button></div>)}</>}
  {service.serviceType==='LANDSCAPING_SOD'&&<Field label={label('disposalScope')}><Select value={service.disposalScope||''} onChange={e=>onService({...service,disposalScope:e.target.value||undefined})}><option value="">Not configured</option><option value="separate_project_debris">Separate project debris</option></Select></Field>}
  <h3>Business-wide fixed charges and range</h3>{['overheadFixed','minimumJobPrice','travelFee','disposalFee','permitFee'].map(field=><Field key={field} label={human(field.replace(/([A-Z])/g,' $1'))+' ($)'}><ExactNumericInput kind="fixed_amount" value={defaults[field]} onChange={v=>onDefault(field,v)}/></Field>)}
  <Field label="Estimate range buffer (%)"><ExactNumericInput value={defaults.rangeBufferPercent} onChange={v=>onDefault('rangeBufferPercent',v)}/></Field>
  <Field label="Peak surcharge (%)"><ExactNumericInput value={defaults.peakSurchargePercent} onChange={v=>onDefault('peakSurchargePercent',v)}/></Field>
  <fieldset><legend>Peak months</legend>{Array.from({length:12},(_,i)=>i+1).map(month=><label key={month}><input type="checkbox" checked={defaults.peakMonths?.includes(month)||false} onChange={e=>onDefault('peakMonths',e.target.checked?[...(defaults.peakMonths||[]),month].sort((a,b)=>a-b):(defaults.peakMonths||[]).filter(n=>n!==month))}/>{month} </label>)}<Button variant="quiet" onClick={()=>onDefault('peakMonths',[])}>No peak months</Button></fieldset>
 </section>;
}

export function SavedApproval({ownerId,serviceId,draft,onApproved,onBusyChange}) {
 const [saved,setSaved]=useState(null),[status,setStatus]=useState(null),[confirmed,setConfirmed]=useState({}),[ack,setAck]=useState(false),[legacy,setLegacy]=useState(false),[source,setSource]=useState(''),[error,setError]=useState(null),[free,setFree]=useState(null);
 async function open(){onBusyChange?.(true);try{const book=await api('/api/pricebook/'+ownerId);const validation=await api('/api/pricebook/validate',{method:'POST',body:book});const selected=book.services.find(s=>s.id===serviceId);if(!selected)throw Error('Save this service first.');const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;if(JSON.stringify(canonical(draft.services.find(s=>s.id===serviceId)))!==JSON.stringify(canonical(selected))||JSON.stringify(canonical(draft.defaults))!==JSON.stringify(canonical(book.defaults)))throw Error('Save editor changes before reviewing the saved configuration.');setSaved({book,service:selected});setStatus(validation.statuses.find(s=>s.serviceId===serviceId));setAck(false);setLegacy(false);setConfirmed({});setSource(selected.source||'');setFree(null);setError(null);}catch(e){setError(e);}finally{onBusyChange?.(false);}}
 useEffect(()=>{setSaved(null);setError(null);},[serviceId]);
 async function approve(){onBusyChange?.(true);try{await api('/api/pricebook/services/'+serviceId+'/approve',{method:'POST',body:{revision:saved.book.revision,confirmConfiguration:ack,confirmLegacySettings:legacy,source,fields:Object.keys(confirmed).filter(k=>confirmed[k]),...(free?{zeroClassification:free}:{})}});setSaved(null);await onApproved();}catch(e){setError(e);}finally{onBusyChange?.(false);}}
 return <section className="editor-section"><h2>Owner approval</h2><Button variant="secondary" disabled={!serviceId} onClick={open}>Review saved configuration</Button>{saved&&<>
  <Notice>This review shows the saved configuration. Save editor changes before opening a new review. Confirming does not enable a disabled service.</Notice>
  <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify({service:saved.service,defaults:saved.book.defaults},null,2)}</pre>
  {!saved.service.source&&<Field label="Original pricing source"><Select value={source} onChange={e=>setSource(e.target.value)}><option value="">Choose</option><option value="MANUAL">Entered by owner</option><option value="AI_SUGGESTED">AI suggested</option><option value="AI_INTERVIEW">AI interview</option></Select></Field>}
  {['AI_SUGGESTED','AI_INTERVIEW'].includes(source)&&(status?.confirmationFields||[]).map(field=><label key={field} style={{display:'block'}}><input type="checkbox" checked={confirmed[field]===true} onChange={e=>setConfirmed({...confirmed,[field]:e.target.checked})}/> Confirm {field}</label>)}
  {!!status?.legacySettings?.length&&<><pre>{JSON.stringify(status.legacySettings,null,2)}</pre><label><input type="checkbox" checked={legacy} onChange={e=>setLegacy(e.target.checked)}/> I confirm these retained legacy settings are not used by the measured quote contract.</label></>}
  <details><summary>Explicit free offerings and included required prices</summary><p>Use only for an explicitly free complete offering or a required price included in another positive all-in price.</p><Button variant="secondary" onClick={()=>setFree({freeCompleteService:saved.service.zeroPricePolicy?.freeCompleteService||false,freeTiers:saved.service.zeroPricePolicy?.freeTiers||[],includedPrices:saved.service.zeroPricePolicy?.includedPrices||{}})}>Edit explicit zero classification</Button>{free&&<><label><input type="checkbox" checked={free.freeCompleteService} onChange={e=>setFree({...free,freeCompleteService:e.target.checked})}/> Entire base offering explicitly free</label>{(saved.service.tiers||[]).map(t=><label key={t.name}><input type="checkbox" checked={free.freeTiers.includes(t.name)} onChange={e=>setFree({...free,freeTiers:e.target.checked?[...free.freeTiers,t.name]:free.freeTiers.filter(n=>n!==t.name)})}/> Entire {t.name} offering explicitly free</label>)}<IncludedPrices value={free.includedPrices} onChange={includedPrices=>setFree({...free,includedPrices})}/></>}</details>
  <label><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/> I confirm these exact saved prices, units, factors and rules.</label><Button disabled={!ack||(status?.legacySettings?.length&&!legacy)||!source||(['AI_SUGGESTED','AI_INTERVIEW'].includes(source)&&(status?.confirmationFields||[]).some(f=>!confirmed[f]))} onClick={approve}>Confirm saved configuration</Button>
 </>}<ErrorMessage error={error}/></section>;
}
function IncludedPrices({value,onChange}) {const [from,setFrom]=useState(''),[to,setTo]=useState('');return <div>{Object.entries(value).map(([a,b])=><p key={a}>{a} included in {b} <Button variant="quiet" onClick={()=>{const v={...value};delete v[a];onChange(v);}}>Remove</Button></p>)}<Field label="Included zero price path"><TextInput value={from} onChange={e=>setFrom(e.target.value)}/></Field><Field label="Covering positive price path"><TextInput value={to} onChange={e=>setTo(e.target.value)}/></Field><Button variant="secondary" onClick={()=>{if(from&&to){onChange({...value,[from]:to});setFrom('');setTo('');}}}>Add explicit inclusion</Button></div>;}
