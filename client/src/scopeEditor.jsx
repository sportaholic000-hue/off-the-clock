import React from 'react';
import {humanPricingKey} from './pricebookFormatting.js';
import {Field,Select,Textarea,Button,Notice} from './ui.jsx';
import {ExactNumericInput} from './pricebookInputs.jsx';
import {servicePricing,editServiceField} from './pricebookEditing.js';
import {scopeDefinitions,scopeRateDefinitions} from '../../server/scopeConfiguration.js';

export function ScopeEditor({service,onChange}) {
 const p=servicePricing(service),details=p.scopeDetails||{},rates=p.scopeRates||{},catalog=scopeDefinitions(service.serviceType,p),priceFields=scopeRateDefinitions(service.serviceType,p);
 const set=(field,value)=>onChange(editServiceField(service,field,value));
 const detail=(key,name,value)=>{const next={...details[key]};if(value===undefined)delete next[name];else next[name]=value;set('scopeDetails',{...details,[key]:next});};
 return <section className="editor-section"><h2>Additional priced scope</h2>
  <p>Configure the work and products you offer. Enter your actual prices and inclusions. A customer selects matching work and supplies the measurements; a missing price or unresolved detail still needs correction.</p>
  <Notice>Complete installed prices include the described work and receive no additional markup. Itemized labor and materials use your category settings. Package costs use the stated coverage and waste allowance, rounded up to whole purchases. Use the same purchase group only for the exact same product and variant.</Notice>
  {Object.entries(catalog).map(([key,def])=>{
   const d=details[key];
   const activePrices=Object.entries(priceFields).filter(([,field])=>field.scopeKey===key);
   return <div className="editor-section" key={key}><h3>{def.label}</h3>{!d?<Button variant="secondary" onClick={()=>set('scopeDetails',{...details,[key]:{}})}>Configure {def.label}</Button>:<>
    {Object.entries(def.fields).filter(([name])=>!(name==='category'&&d.mode!=='installed')&&!(['coverage','wastePercent','productKey'].includes(name)&&d.mode!=='package_cost')).map(([name,f])=><Field key={name} label={f.label+(f.unit?' ('+f.unit+')':'')}>
     {f.type==='boolean'||f.type==='enum'?<Select aria-label={def.label+' — '+f.label} value={d[name]===undefined?'':String(d[name])} onChange={e=>detail(key,name,e.target.value===''?undefined:(f.type==='boolean'?[true,false]:f.values).find(v=>String(v)===e.target.value))}><option value="">Choose</option>{(f.type==='boolean'?[true,false]:f.values).map(v=><option key={String(v)} value={String(v)}>{typeof v==='boolean'?(v?'Yes':'No'):humanPricingKey(v)}</option>)}</Select>:
      f.type==='number'?<ExactNumericInput aria-label={def.label+' — '+f.label} value={d[name]} onChange={v=>detail(key,name,v)}/>:
      <Textarea aria-label={def.label+' — '+f.label} value={d[name]||''} onChange={e=>detail(key,name,e.target.value)}/>}
    </Field>)}
    {d.mode==='included_in_floor_price'&&<Notice>Underlayment is included in your flooring material price. No additional underlayment charge or purchase quantity is added.{rates[key]!==undefined?' The earlier separate price ($'+rates[key]+') is retained but is not charged in this mode.':''}</Notice>}
    {activePrices.map(([name,f])=><Field key={name} label={f.label+' ($ per '+f.unit+')'} help={f.priceBasis==='sell_price'?'Final selling price; no additional markup.':f.priceBasis==='cost'?'Purchase cost; the configured material markup and tax treatment apply.':'Uses your '+f.category+' price basis, markup and tax treatment.'}><ExactNumericInput aria-label={'Scope price '+name} kind={f.moneyKind} value={rates[name]} onChange={v=>{const next={...rates};if(v===undefined)delete next[name];else next[name]=v;set('scopeRates',next);}}/></Field>)}
    <Button variant="quiet" onClick={()=>{const next={...details};delete next[key];let updated=editServiceField(service,'scopeDetails',next);const valid=scopeRateDefinitions(service.serviceType,{...p,scopeDetails:next},true);updated=editServiceField(updated,'scopeRates',Object.fromEntries(Object.entries(rates).filter(([name])=>valid[name])));onChange(updated);}}>Remove {def.label} configuration and prices</Button>
   </>}</div>;
  })}
 </section>;
}
