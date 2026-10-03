import {scopeCustomerFields,scopeRateDefinitions} from '../../server/scopeConfiguration.js';
import {offeringPriceBaseline,offeringBaselineConfirmation} from '../../server/quote-engine-vnext/configuredOfferings.js';
import React,{useState} from 'react';
import {Field,Select,TextInput,Textarea,Button,Notice} from './ui.jsx';
import {ExactNumericInput,FenceHeightInput} from './pricebookInputs.jsx';
import {servicePricing,editServiceField} from './pricebookEditing.js';
import {productKeyFromName,DUPLICATE_NAME_MESSAGE} from './pricebookFormatting.js';

export function offeringPreviewFields(meta,service) {
  const p=servicePricing(service),source=meta.offeringCustomerFields?.[p.offeringMode];
  const extra=Object.entries(scopeCustomerFields(service.serviceType,p,service)).map(([name,field])=>({name,...field}));
  if(!source)return [...meta.customerFields,...extra];
  return [...extra,...source.map(field=>field.name!=='gates'?field:{...field,values:Object.keys(p.offeringDetails?.gates||{}),options:Object.fromEntries(Object.entries(p.offeringDetails?.gates||{}).map(([key,gate])=>[key,`${key.replaceAll('_',' ')} — ${gate.widthLF??'?'} ft opening; ${gate.description||''}`]))})];
}

export function offeringTierFields(meta,service) {
  const p=servicePricing(service),mode=p.offeringMode;
  const scopeRates=scopeRateDefinitions(service.serviceType,p);
  const scopeFields=Object.keys(scopeRates).length?[{field:'scopeRates',label:'Additional scope prices',type:'json',tree:{depth:1,leafKeys:Object.keys(scopeRates),leafMoneyKinds:Object.fromEntries(Object.entries(scopeRates).map(([key,f])=>[key,f.moneyKind]))}}]:[];
  const fields=!mode?meta.fields.filter(field=>!['offering_configuration','scope_configuration'].includes(field.type)):
    [meta.fields.find(field=>field.field==='minimumJob'),{field:'offeringRates',label:'Offering unit prices — '+offeringPriceBaseline(service.serviceType).condition,type:'json',moneyKind:'unit_rate',tree:{depth:1,leafKeys:Object.keys(p.offeringRates||{})}}].filter(Boolean);
  return [...fields,...scopeFields];
}

export function OfferingEditor({service,meta,onChange}) {
  const p=servicePricing(service),mode=p.offeringMode,d=p.offeringDetails||{},rates=p.offeringRates||{},fence=service.serviceType.startsWith('FENCING_'),interior=service.serviceType==='INTERIOR_PAINTING';
  const [gateName,setGateName]=useState(''),[gateError,setGateError]=useState('');
  const baseline=offeringPriceBaseline(service.serviceType),confirmation=offeringBaselineConfirmation(service.serviceType,p);
  const legacyCondition=d[baseline.field]!==undefined&&d[baseline.field]!==baseline.value;
  const baselineNote=`Baseline prices cover ${baseline.condition}. ${baseline.adjustment} adjustments apply on top to labor only.${interior?' Wall height adjusts walls and ceilings; trim prices do not change with wall height.':''}`;
  const set=(key,value)=>onChange(editServiceField(service,key,value));
  const detail=(key,value)=>set('offeringDetails',{...(fence?{terrainSlope:'flat'}:interior?{wallHeight:'standard',finishCoats:2,ceilingCoats:2}:{stories:1,finishCoats:2}),...d,[key]:value});
  const input=(key,label,type='text',options)=> <Field key={key} label={label}>{type==='select'||type==='boolean'?<Select aria-label={label} value={d[key]===undefined?'':String(d[key])} onChange={e=>detail(key,e.target.value===''?undefined:type==='boolean'?e.target.value==='true':options.find(v=>String(v)===e.target.value))}><option value="">Choose</option>{(type==='boolean'?[true,false]:options).map(value=><option key={String(value)} value={String(value)}>{typeof value==='boolean'?(value?'Yes':'No'):String(value)}</option>)}</Select>:type==='number'?<ExactNumericInput aria-label={label} value={d[key]} onChange={value=>detail(key,value)}/>:<Textarea aria-label={label} value={d[key]||''} onChange={e=>detail(key,e.target.value)}/>}</Field>;
  const definitions={...(meta.offeringRateFields?.[mode]||{})};
  for(const key of Object.keys(definitions)) {
    if(['prepLaborPerSqft','prepMaterialPerSqft'].includes(key))delete definitions[key];
    if(key.startsWith('primer')&&!d.primerCoats)delete definitions[key];
    if(/^(?:installedCeiling|ceiling)/.test(key)&&!d.ceilingsOffered)delete definitions[key];
    if(key.startsWith('ceilingPrimer')&&!d.ceilingPrimerCoats)delete definitions[key];
    if(key==='installedTrimPerLF'&&!d.trimOffered)delete definitions[key];
    if(key==='removalPerLF'&&!d.removalOffered)delete definitions[key];
  }
  for(const [key,gate] of Object.entries(d.gates||{}))definitions['gate_'+key]={label:'Installed gate: '+key.replaceAll('_',' '),unit:'gates',priceBasis:'sell_price'};
  if(!fence&&mode==='itemized'&&service.priceBasisByCategory?.material==='cost')for(const key of Object.keys(definitions))if(definitions[key].category==='material')delete definitions[key];
  const usedLegacyPrep=mode==='itemized'?['prepLaborPerSqft','prepMaterialPerSqft'].filter(key=>rates[key]!==undefined&&rates[key+'_'+d.surfaceCondition]===undefined):[];
  const unused=Object.keys(rates).filter(key=>!definitions[key]&&!usedLegacyPrep.includes(key));
  function removeRate(key){const next={...rates};delete next[key];set('offeringRates',next);}
  return <section className="editor-section"><h2>Fence and painting offering</h2>
    <Field label="Offering pricing"><Select aria-label="Offering pricing" value={mode||''} onChange={e=>set('offeringMode',e.target.value||undefined)}><option value="" disabled={!!mode}>{meta.requiresOffering?'Choose how you price this offering':'Measured wall pricing — choose to configure an offering'}</option><option value="installed">Complete installed prices</option><option value="itemized">Itemized measured components</option></Select></Field>
    {!mode&&meta.requiresOffering&&<Notice>Choose installed or itemized pricing, then define what the offering includes. Earlier standard rates are retained in your saved price book but cannot quote this work on their own.</Notice>}
    {mode&&<>
      <p>Define one offered job and the prices that cover it. Add another offering for a different {fence?'fence height, material or installation scope':'surface, coating or preparation scope'}. These descriptions are shown to customers.</p>
      <Notice>{baselineNote}</Notice>
      {confirmation&&<Notice tone="warning">{confirmation.message}</Notice>}
      {legacyCondition&&<label><input type="checkbox" checked={d.baselinePricesConfirmed===true} onChange={e=>detail('baselinePricesConfirmed',e.target.checked)}/> I confirm these are baseline prices for {baseline.condition}</label>}
      {input('description','Included job description')}
      {fence?<>
        {input('fenceType','Offered fence type')}<Field label="Offered fence height (ft)"><FenceHeightInput label="Offered fence height (ft)" value={d.fenceHeight} onChange={value=>detail('fenceHeight',value)}/></Field>
        {input('postFootingDescription','Standard posts, footings and digging included')}
        <Notice>{mode==='installed'?'The per-foot installed price includes the defined standard posts and footings. Gate prices include their own posts and footings.':'Infill is priced by fence length. Posts and footings are calculated from fence length, your post spacing, corners and gate counts. Posts included in gate prices are excluded.'} Fence length excludes gate openings.</Notice>
        <h3>Offered gates</h3>
        {d.gates===undefined&&<Button variant="secondary" onClick={()=>detail('gates',{})}>No gates offered</Button>}
        {Object.entries(d.gates||{}).map(([key,gate])=>{
          const change=(field,value)=>detail('gates',{...d.gates,[key]:{...gate,[field]:value}});
          return <div className="editor-section" key={key}><h4>{key.replaceAll('_',' ')}</h4>
            <Field label="Gate opening width (ft)"><ExactNumericInput aria-label={'Gate opening width '+key} value={gate.widthLF} onChange={value=>change('widthLF',value)}/></Field>
            <Field label="Gate, hardware and installation included"><Textarea aria-label={'Gate description '+key} value={gate.description||''} onChange={e=>change('description',e.target.value)}/></Field>
            <Field label="Gate price includes gate posts and footings"><Select aria-label={'Gate posts included '+key} value={gate.postsAndFootingsIncluded===undefined?'':String(gate.postsAndFootingsIncluded)} onChange={e=>change('postsAndFootingsIncluded',e.target.value===''?undefined:e.target.value==='true')}><option value="">Choose</option><option value="true">Yes</option><option value="false" disabled={mode==='installed'}>No — counted and priced separately</option></Select></Field>
            <Button variant="quiet" onClick={()=>{const next={...d.gates};delete next[key];detail('gates',next);}}>Remove gate offering</Button>
          </div>;
        })}
        <Field label="New gate name"><TextInput aria-label="New gate name" value={gateName} onChange={e=>{setGateName(e.target.value);setGateError('');}}/></Field>
        <Button variant="secondary" onClick={()=>{const {key,error}=productKeyFromName(gateName);if(error){setGateError(error);return;}if(Object.hasOwn(d.gates||{},key)){setGateError(DUPLICATE_NAME_MESSAGE);return;}detail('gates',{...(d.gates||{}),[key]:{description:gateName.trim()}});setGateName('');setGateError('');}}>Add gate offering</Button>{gateError&&<span className="field-error" role="alert">{gateError}</span>}
        {service.serviceType==='FENCING_REPLACEMENT'&&<>{input('removalOffered','Offer fence removal','boolean')}{d.removalOffered&&<>{input('removalDescription','Removal work included')}{input('removalIncludesDisposal','Removal price includes disposal','boolean')}</>}</>}
      </>:<>
        {input('substrate','Paintable surface covered')}{input('coating','Coating and product system')}{mode==='installed'&&input('finishCoats','Wall finish coats','select',[1,2,3])}
        {(mode==='installed'||rates.prepLaborPerSqft!==undefined||rates.prepMaterialPerSqft!==undefined)&&input('surfaceCondition',mode==='installed'?'Surface condition covered':'Condition for retained preparation prices','select',['good','fair','poor'])}{input('preparation','Preparation work included')}{input('primerCoats','Wall primer coats included','select',[0,1,2,3])}
        <Notice>{mode==='installed'?'The installed wall price includes the defined finish coats, preparation and primer over the quoted area.':'Finish paint uses the requested coat count. Preparation covers the entire measured painted area at your price for the reported surface condition. Material quantities include the waste settings below. For owner material costs, configure products, package coverage and purchase prices under Additional priced scope.'}</Notice>
        {interior?<>{input('ceilingsOffered','Offer ceiling painting','boolean')}{d.ceilingsOffered&&<>{mode==='installed'&&input('ceilingCoats','Ceiling finish coats','select',[1,2,3])}{input('ceilingPrimerCoats','Ceiling primer coats','select',[0,1,2,3])}</>}{input('trimOffered','Offer trim painting','boolean')}{d.trimOffered&&input('trimDescription','Trim coats, preparation and primer included')}</>:null}
      </>}
      <h3>Owner prices for this offering — {baseline.condition}</h3>
      {Object.entries(definitions).map(([key,field])=><Field key={key} label={field.label+(key==='installedTrimPerLF'?'':' — '+baseline.condition)+' ($ per '+field.unit+')'} help={(key==='installedTrimPerLF'?'Trim is priced by measured length. Wall height does not adjust this price.':baselineNote)+' '+(field.priceBasis==='sell_price'?'Complete selling price; no additional markup is applied.':'Uses the configured price basis and tax treatment for '+field.category+'.')}><ExactNumericInput aria-label={'Offering price '+key} kind="unit_rate" value={rates[key]??(key.endsWith('_'+d.surfaceCondition)?rates[key.slice(0,-d.surfaceCondition.length-1)]:undefined)} onChange={value=>{const next={...rates};if(value===undefined){delete next[key];if(key.endsWith('_'+d.surfaceCondition))delete next[key.slice(0,-d.surfaceCondition.length-1)];}else next[key]=value;set('offeringRates',next);}}/></Field>)}
      {!!unused.length&&<><h3>Prices outside this selection</h3><p>These saved prices are retained and do not contribute to this selection. Remove them if they no longer belong to this offering.</p>{unused.map(key=><div key={key}>{key}: {String(rates[key])} <Button variant="quiet" onClick={()=>removeRate(key)}>Remove unused price</Button></div>)}</>}
    </>}
  </section>;
}
