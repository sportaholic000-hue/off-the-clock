import React from 'react';
import {Field,Select,Notice,Button} from './ui.jsx';
import {ExactNumericInput} from './pricebookInputs.jsx';
import {servicePricing,editServiceField} from './pricebookEditing.js';
import {paintingType,surfaceType,COAT_RATIOS,PAINTING_RATES,SIDING_CONVENTIONS,surfaceExtraDefinitions} from '../../server/quote-engine-vnext/surfacePricing.js';
import {exactDivide,exactAdd,exactMultiply,exactToNumber} from '../../server/quote-engine-vnext/exactMath.js';

const assign=(map,key,value)=>{const next={...map};if(value===undefined)delete next[key];else next[key]=value;return next;};
export function SurfacePricingEditor({service,onChange}){
 const type=service.serviceType,p=servicePricing(service);
 if(!surfaceType(type))return null;
 const set=(root,key,value)=>onChange(editServiceField(service,root,assign(p[root],key,value)));
 const settings=p.paintingSettings||{},siding=p.sidingSettings||{};
 const perCoat={wallAdditionalCoatRatio:p.offeringRates?.wallLaborPerSqftPerCoat??p.laborPerWallSqftPerCoat,ceilingAdditionalCoatRatio:p.offeringRates?.ceilingLaborPerSqftPerCoat??p.ceilingLaborPerSqftPerCoat,trimAdditionalCoatRatio:p.paintingRates?.trimLaborPerLFPerCoat??p.trimLaborPerLF,primerAdditionalCoatRatio:p.offeringRates?.primerLaborPerSqftPerCoat??p.paintingRates?.primerLaborPerSqftPerCoat,ceilingPrimerAdditionalCoatRatio:p.offeringRates?.ceilingPrimerLaborPerSqftPerCoat??p.paintingRates?.ceilingPrimerLaborPerSqftPerCoat,trimPrimerAdditionalCoatRatio:p.paintingRates?.trimPrimerLaborPerLFPerCoat};
 const split=key=>{
  const rate=perCoat[key],r=settings[key];
  if(typeof rate!=='number'||!Number.isFinite(rate)||typeof r!=='number'||!Number.isFinite(r)||r<0)return null;
  const first=exactDivide(exactMultiply(rate,2),exactAdd(1,r));
  const display=v=>exactToNumber(v).toLocaleString('en-US',{maximumSignificantDigits:12});
  return <p className="field-help">First-coat labor per unit: {display(first)}. Each additional coat: {display(exactMultiply(first,r))}. Display uses the same currency as your prices; extended lines retain fractional unit prices.</p>;
 };
 return <section className="editor-section" aria-label="Painting and siding measurements and extras">
  {paintingType(type)&&<>
   <h2>Coats and measured surfaces</h2>
   <Notice>Leave an additional-coat ratio blank to keep your current per-coat labor price. Setting a ratio converts that price into first-coat and additional-coat prices while keeping its unrounded two-coat labor price. Each extended coat line is rounded separately, so some totals can differ by one cent. Materials stay per coat. No starting ratios are supplied.</Notice>
   {p.offeringMode!=='installed'&&Object.entries(COAT_RATIOS).map(([key,label])=><Field key={key} label={label+' — additional-coat labor ratio'}><ExactNumericInput aria-label={label+' — additional-coat labor ratio'} value={settings[key]} onChange={v=>set('paintingSettings',key,v)}/>{split(key)}</Field>)}
   {type==='INTERIOR_PAINTING'&&<>
    <h3>Wall-height bands in feet</h3><p>Leave all bands blank to keep Standard / High / Vaulted and their current adjustments. When you enter bands, customers give a height in feet. Each upper limit is included in its band.</p>
    {Object.entries({standardMaxFeet:'Standard — maximum height in feet',highMaxFeet:'High — maximum height in feet',vaultedMaxFeet:'Vaulted — maximum height in feet'}).map(([key,label])=><Field key={key} label={label}><ExactNumericInput aria-label={label} value={settings.heightBands?.[key]} onChange={v=>{const bands=assign(settings.heightBands,key,v);set('paintingSettings','heightBands',Object.keys(bands).length?bands:undefined);}}/></Field>)}
   </>}
   {p.offeringMode!=='installed'&&<>
    <h3>Additional painting component prices</h3>
    <p>These are optional prices per coat. For per-coat trim, enter both trim labor and material prices to replace the retained trim price in basic or itemized painting. Preparation prices are separate and follow the trim's condition.</p>
    {!p.offeringMode&&['primerCoats','ceilingPrimerCoats'].map(key=><Field key={key} label={key==='primerCoats'?'Wall primer coats included':'Ceiling primer coats included'}><ExactNumericInput aria-label={key==='primerCoats'?'Wall primer coats included':'Ceiling primer coats included'} value={settings[key]} onChange={v=>set('paintingSettings',key,v)}/></Field>)}
    <Field label="Trim primer coats included"><ExactNumericInput aria-label="Trim primer coats included" value={settings.trimPrimerCoats} onChange={v=>set('paintingSettings','trimPrimerCoats',v)}/></Field>
    {Object.entries(PAINTING_RATES).filter(([key])=>!p.offeringMode||key.startsWith('trim')).map(([key,label])=><Field key={key} label={label}><ExactNumericInput aria-label={label} value={p.paintingRates?.[key]} kind="unit_rate" onChange={v=>set('paintingRates',key,v)}/></Field>)}
   </>}
  </>}
  {type==='SIDING_REPLACEMENT'&&<>
   <h2>Siding area conventions</h2>
   <p>Choose the convention used to set each siding rate. Direct area remains available. Dimension-based quotes require a saved convention; no convention is guessed for an existing rate.</p>
   {['vinyl','fiber_cement','wood','metal'].map(key=><Field key={key} label={key.replaceAll('_',' ')+' — area convention'}><Select aria-label={key.replaceAll('_',' ')+' — area convention'} value={siding.areaConventionByType?.[key]||''} onChange={e=>set('sidingSettings','areaConventionByType',assign(siding.areaConventionByType,key,e.target.value||undefined))}><option value="">Not set</option>{Object.entries(SIDING_CONVENTIONS).map(([v,label])=><option key={v} value={v}>{label}</option>)}</Select></Field>)}
   <Field label="Soffit price unit"><Select aria-label="Soffit price unit" value={siding.soffitUnit||''} onChange={e=>set('sidingSettings','soffitUnit',e.target.value||undefined)}><option value="">Not set</option><option value="square_feet">Square feet</option><option value="linear_feet">Linear feet</option></Select></Field>
  </>}
  <h3>Optional complete installed prices</h3>
  <p>Leave a price blank when you have not priced that work. If requested, it is excluded from the rest of the quote and needs its own estimate. These prices include the complete item; no separate material or labor adjustment is added.</p>
  {Object.entries(surfaceExtraDefinitions(type,p)).map(([key,d])=><Field key={key} label={d.label+' — complete installed price per '+d.unit}><ExactNumericInput aria-label={d.label+' — complete installed price per '+d.unit} value={p.surfaceExtraRates?.[key]} kind={d.integer?'fixed_amount':'unit_rate'} onChange={v=>set('surfaceExtraRates',key,v)}/></Field>)}
 </section>;
}

export function SurfaceRowsInput({field,value,onChange}){
 const rows=Array.isArray(value)?value:[];
 return <>
  {rows.map((row,i)=><fieldset key={i}><legend>{field.label} {i+1}</legend>{Object.entries(field.rowFields).map(([key,d])=>d.type==='surface_rows'?<div key={key}><p>{d.details?.join(' ')}</p><SurfaceRowsInput field={{...d,label:field.label+' '+(i+1)+' — '+d.label}} value={row?.[key]} onChange={v=>onChange(rows.map((r,n)=>n===i?assign(r,key,v):r))}/></div>:<Field key={key} label={d.label+' ('+d.unit+')'}><ExactNumericInput aria-label={field.label+' '+(i+1)+' '+d.label} value={row?.[key]} onChange={v=>onChange(rows.map((r,n)=>n===i?assign(r,key,v):r))}/></Field>)}<Button variant="quiet" onClick={()=>onChange(rows.filter((_,n)=>n!==i))}>Remove {field.label.toLowerCase()} {i+1}</Button></fieldset>)}
  <Button variant="secondary" disabled={rows.length>=field.maxRows} onClick={()=>onChange([...rows,{}])}>Add {field.label.toLowerCase()}</Button>
  {field.minRows===0&&<Button variant="secondary" onClick={()=>onChange([])}>No {field.label.toLowerCase()}</Button>}
 </>;
}
