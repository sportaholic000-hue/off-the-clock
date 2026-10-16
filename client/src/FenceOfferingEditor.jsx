import React,{useState} from 'react';
import {Field,Select,TextInput,Textarea,Button,Notice} from './ui.jsx';
import {ExactNumericInput,FenceHeightInput} from './pricebookInputs.jsx';
import {servicePricing,editServiceField,editServiceTiers,addPriceTier} from './pricebookEditing.js';
import {productKeyFromName,DUPLICATE_NAME_MESSAGE,humanPricingKey} from './pricebookFormatting.js';
import {fenceOfferingFromLegacy} from '../../server/quote-engine-vnext/fencePricing.js';
import {offeringRateDefinitions,offeringBaselineConfirmation} from '../../server/quote-engine-vnext/configuredOfferings.js';

const without=(value,key)=>Object.fromEntries(Object.entries(value||{}).filter(([k])=>k!==key));
const setValue=(value,key,next)=>next===undefined?without(value,key):{...value,[key]:next};
function RowPrices({serviceType,offer,row,onChange,inherit}) {
  const definitions=offeringRateDefinitions(serviceType,offer);
  for(const k of ['postMaterialEach','footingLaborEach','footingMaterialEach'])delete definitions[k];
  return <>{Object.entries(definitions).map(([key,field])=><div key={key}>
    <Field label={field.label+' ($ per '+field.unit+')'} help={inherit?'Leave blank to inherit the base row price.':undefined}><ExactNumericInput aria-label={field.label+' ($ per '+field.unit+')'} kind={field.moneyKind} value={row.offeringRates?.[key]} onChange={v=>onChange({...row,offeringRates:setValue(row.offeringRates,key,v)})}/></Field>
    {field.priceBasis==='sell_price'&&['installedLaborPercent','installedMaterialsPercent'].map((name,i)=><Field key={name} label={i?'Materials share (%)':'Labor portion (%)'} help={inherit?'Leave blank to inherit the base row allocation.':undefined}><ExactNumericInput aria-label={field.label+' — '+(i?'Materials share (%)':'Labor portion (%)')} value={row[name]?.['offeringRates.'+key]} onChange={v=>onChange({...row,[name]:setValue(row[name],'offeringRates.'+key,v)})}/></Field>)}
  </div>)}</>;
}

export function FenceOfferingEditor({service,meta,onChange}) {
  const p=servicePricing(service),[name,setName]=useState(''),[error,setError]=useState('');
  const legacy=!p.fenceOfferings&&p.offeringMode&&p.offeringDetails?.fenceType;
  const offers=p.fenceOfferings||(legacy?{[p.offeringDetails.fenceType]:fenceOfferingFromLegacy({...p,postSpacingLF:p.postSpacingLF??meta?.class2Defaults?.postSpacingLF},service.tiers||[])}:{});
  function save(next,known=service.knownOfferings){
    let updated=editServiceField(service,'fenceOfferings',next);
    if(legacy){updated=editServiceTiers(updated,[]);for(const field of ['offeringMode','offeringDetails','offeringRates','heightRows','installedLaborPercent','installedMaterialsPercent'])updated=editServiceField(updated,field,undefined);}
    onChange({...updated,knownOfferings:known});
  }
  return <section className="editor-section"><h2>Fence offerings</h2>
    <Notice>Set a price row for each height you build. A row covers heights over its lower limit, up to and including its maximum. Overlapping rows cannot be saved. A height without a row requires owner review.</Notice>
    {legacy&&<Notice>Only the saved fence height is priced. Add rows for the other heights you build. Editing this offering retains its saved prices in an exact-height row.</Notice>}
    {Object.entries(offers).map(([type,offer])=><FenceTypeEditor key={type} serviceType={service.serviceType} type={type} offer={offer} onChange={value=>save({...offers,[type]:value})} onRemove={()=>save(without(offers,type))}/>)}
    <Field label="New fence type name"><TextInput aria-label="New fence type name" value={name} onChange={e=>{setName(e.target.value);setError('');}}/></Field>
    <Button variant="secondary" onClick={()=>{const {key,error:problem}=productKeyFromName(name);if(problem){setError(problem);return;}if(Object.hasOwn(offers,key)){setError(DUPLICATE_NAME_MESSAGE);return;}
      const known={...service.knownOfferings,fenceType:{...service.knownOfferings?.fenceType,[key]:service.knownOfferings?.fenceType?.[key]||crypto.randomUUID()}};
      save({...offers,[key]:{offeringDetails:{fenceType:key,terrainSlope:'flat',gates:{}},heightRows:{},tiers:[]}},known);setName('');setError('');
    }}>Add fence offering</Button>{error&&<span className="field-error" role="alert">{error}</span>}
  </section>;
}
function FenceTypeEditor({serviceType,type,offer,onChange,onRemove}) {
  const [gateName,setGateName]=useState(''),[gateError,setGateError]=useState('');
  const d=offer.offeringDetails||{},rows=offer.heightRows||{},tiers=offer.tiers||[];
  const detail=(key,v)=>onChange({...offer,offeringDetails:setValue(d,key,v)});
  const text=(key,label)=><Field label={label}><Textarea aria-label={label+' — '+type} value={d[key]||''} onChange={e=>detail(key,e.target.value)}/></Field>;
  const bool=(key,label)=><Field label={label}><Select aria-label={label+' — '+type} value={d[key]===undefined?'':String(d[key])} onChange={e=>detail(key,e.target.value===''?undefined:e.target.value==='true')}><option value="">Choose</option><option value="true">Yes</option><option value="false">No</option></Select></Field>;
  const rowChange=(key,row)=>onChange({...offer,heightRows:{...rows,[key]:row}});
  function removeGate(key){
    const clean=entry=>({...entry,installedLaborPercent:without(entry.installedLaborPercent,'offeringRates.gate_'+key),installedMaterialsPercent:without(entry.installedMaterialsPercent,'offeringRates.gate_'+key),...(entry.offeringDetails?{offeringDetails:{...entry.offeringDetails,gates:without(entry.offeringDetails.gates,key)}}:{}),heightRows:Object.fromEntries(Object.entries(entry.heightRows||{}).map(([name,row])=>[name,{...row,offeringRates:without(row.offeringRates,'gate_'+key),installedLaborPercent:without(row.installedLaborPercent,'offeringRates.gate_'+key),installedMaterialsPercent:without(row.installedMaterialsPercent,'offeringRates.gate_'+key)}]))});
    onChange({...clean(offer),tiers:tiers.map(t=>({...t,overrides:clean(t.overrides||{})}))});
  }
  const confirmation=offeringBaselineConfirmation(serviceType,offer);
  return <section className="editor-section" data-fence-type={type}><h3>{humanPricingKey(type)}</h3>
    {confirmation&&<Notice tone="warning">{confirmation.message}</Notice>}
    <Field label="Offering pricing"><Select aria-label={'Offering pricing — '+type} value={offer.offeringMode||''} onChange={e=>onChange({...offer,offeringMode:e.target.value||undefined})}><option value="">Choose how you price this offering</option><option value="installed">Complete installed prices</option><option value="itemized">Itemized measured components</option></Select></Field>
    {text('description','Included job description')}{text('postFootingDescription','Standard posts, footings and digging included')}
    {d.terrainSlope&&d.terrainSlope!=='flat'&&<label><input type="checkbox" checked={d.baselinePricesConfirmed===true} onChange={e=>detail('baselinePricesConfirmed',e.target.checked)}/> I confirm these are baseline prices for flat ground</label>}
    <Notice>{offer.offeringMode==='installed'?'The per-foot installed price includes the defined standard posts and footings. Gate prices include their own posts and footings.':'Infill is priced by fence length. Line and terminal posts and footings use the selected height row and measured sections. Posts included in gate prices are excluded.'} Terrain adjusts labor only. Fence length excludes gate openings.</Notice>
    <h4>Offered gates</h4>{Object.entries(d.gates||{}).map(([key,g])=><div className="editor-section" key={key}><h4>{humanPricingKey(key)}</h4>
      <Field label="Gate opening width (ft)"><ExactNumericInput aria-label={'Gate opening width '+type+' '+key} value={g.widthLF} onChange={v=>detail('gates',{...d.gates,[key]:setValue(g,'widthLF',v)})}/></Field>
      <Field label="Gate, hardware and installation included"><Textarea aria-label={'Gate description '+type+' '+key} value={g.description||''} onChange={e=>detail('gates',{...d.gates,[key]:{...g,description:e.target.value}})}/></Field>
      <Field label="Gate price includes gate posts and footings"><Select aria-label={'Gate posts included '+type+' '+key} value={g.postsAndFootingsIncluded===undefined?'':String(g.postsAndFootingsIncluded)} onChange={e=>detail('gates',{...d.gates,[key]:setValue(g,'postsAndFootingsIncluded',e.target.value===''?undefined:e.target.value==='true')})}><option value="">Choose</option><option value="true">Yes</option><option value="false" disabled={offer.offeringMode==='installed'}>No — counted and priced separately</option></Select></Field>
      <Button variant="quiet" onClick={()=>removeGate(key)}>Remove gate offering</Button>
    </div>)}
    <Field label="New gate name"><TextInput aria-label={'New gate name — '+type} value={gateName} onChange={e=>{setGateName(e.target.value);setGateError('');}}/></Field><Button variant="secondary" onClick={()=>{const {key,error}=productKeyFromName(gateName);if(error){setGateError(error);return;}if(Object.hasOwn(d.gates||{},key)){setGateError(DUPLICATE_NAME_MESSAGE);return;}detail('gates',{...d.gates,[key]:{description:gateName.trim()}});setGateName('');}}>Add gate offering</Button>{gateError&&<span className="field-error" role="alert">{gateError}</span>}
    {serviceType==='FENCING_REPLACEMENT'&&<>{bool('removalOffered','Offer fence removal')}{d.removalOffered&&<>{text('removalDescription','Removal work included')}{bool('removalIncludesDisposal','Removal price includes disposal')}</>}</>}
    <h4>Height rows</h4>{Object.entries(rows).map(([key,row])=><section className="editor-section" data-height-row={key} key={key}><h4>{humanPricingKey(key)}</h4>
      <Field label="Height row coverage"><Select aria-label={'Height row coverage — '+type+' '+key} value={Object.hasOwn(row,'exactHeight')?'exact':'band'} onChange={e=>{const next={...row};for(const k of ['exactHeight','minimumHeight','maximumHeight'])delete next[k];if(e.target.value==='exact')next.exactHeight=row.maximumHeight;else{next.minimumHeight=0;next.maximumHeight=row.exactHeight;}rowChange(key,next);}}><option value="band">Over a lower height, up to and including a maximum</option><option value="exact">Exactly the saved height</option></Select></Field>
      {Object.hasOwn(row,'exactHeight')?<Field label="Exact fence height"><FenceHeightInput label={'Exact fence height — '+type+' '+key} value={row.exactHeight} onChange={v=>rowChange(key,{...row,exactHeight:v})}/></Field>:<><Field label="Height over"><FenceHeightInput label={'Height over — '+type+' '+key} value={row.minimumHeight} onChange={v=>rowChange(key,setValue(row,'minimumHeight',v))}/></Field><Field label="Height up to and including"><FenceHeightInput label={'Height up to and including — '+type+' '+key} value={row.maximumHeight} onChange={v=>rowChange(key,setValue(row,'maximumHeight',v))}/></Field></>}
      <Field label="Post spacing (ft)"><ExactNumericInput aria-label={'Post spacing (ft) — '+type+' '+key} value={row.postSpacingLF} onChange={v=>rowChange(key,setValue(row,'postSpacingLF',v))}/></Field>
      <RowPrices serviceType={serviceType} offer={offer} row={row} onChange={v=>rowChange(key,v)}/>
      <Button variant="quiet" onClick={()=>onChange({...offer,heightRows:without(rows,key),tiers:tiers.map(t=>({...t,overrides:{...t.overrides,heightRows:without(t.overrides?.heightRows,key)}}))})}>Remove height row</Button>
    </section>)}<Button variant="secondary" onClick={()=>{let i=1;while(Object.hasOwn(rows,'height_'+i))i++;rowChange('height_'+i,{minimumHeight:0,offeringRates:{}});}}>Add height row</Button>
    <h4>Price options</h4>{tiers.map((tier,i)=><section className="editor-section" key={i}><Field label="Price option name"><TextInput aria-label={'Price option name — '+type+' '+(i+1)} value={tier.name||''} onChange={e=>onChange({...offer,tiers:tiers.map((t,k)=>k===i?{...t,name:e.target.value}:t)})}/></Field>
      {Object.keys(rows).map(key=><details key={key}><summary>{humanPricingKey(key)}</summary><RowPrices serviceType={serviceType} offer={offer} row={tier.overrides?.heightRows?.[key]||{}} inherit onChange={row=>onChange({...offer,tiers:tiers.map((t,k)=>k===i?{...t,overrides:{...t.overrides,heightRows:{...t.overrides?.heightRows,[key]:row}}}:t)})}/></details>)}
      <Button variant="quiet" onClick={()=>onChange({...offer,tiers:tiers.filter((_,k)=>i!==k)})}>Remove price option</Button>
    </section>)}<Button variant="secondary" disabled={tiers.length>=3} onClick={()=>onChange({...offer,tiers:addPriceTier(tiers)})}>Add price option</Button>
    <Button variant="quiet" onClick={onRemove}>Remove fence offering</Button>
  </section>;
}
