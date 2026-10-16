import {customerQuoteFields} from '../../server/customerQuoteFields.js';
import {scopeRateDefinitions} from '../../server/scopeConfiguration.js';
import {installedPriceDefinitions} from '../../server/installedPriceConfiguration.js';
import {offeringPriceBaseline,offeringBaselineConfirmation,offeringRateDefinitions} from '../../server/quote-engine-vnext/configuredOfferings.js';
import React,{useState} from 'react';
import {FenceOfferingEditor} from './FenceOfferingEditor.jsx';
import {Field,Select,TextInput,Textarea,Button,Notice} from './ui.jsx';
import {ExactNumericInput,FenceHeightInput} from './pricebookInputs.jsx';
import {servicePricing,editServiceField,chooseFenceType,removeGateOffering} from './pricebookEditing.js';
import {productKeyFromName,DUPLICATE_NAME_MESSAGE,humanPricingKey} from './pricebookFormatting.js';
import {mergePricingForValidationVNext} from '../../server/quote-engine-vnext/pricingMerge.js';

export function offeringPreviewFields(meta,service) {
  return customerQuoteFields(service,servicePricing(service));
}

export function offeringTierFields(meta,service,overrides={}) {
  const p=mergePricingForValidationVNext(servicePricing(service),overrides),mode=p.offeringMode;
  const scopeRates=scopeRateDefinitions(service.serviceType,p);
  const scopeFields=Object.keys(scopeRates).length?[{field:'scopeRates',label:'Additional scope prices',type:'json',tree:{depth:1,leafKeys:Object.keys(scopeRates),leafMoneyKinds:Object.fromEntries(Object.entries(scopeRates).map(([key,f])=>[key,f.moneyKind]))}}]:[];
  const replaced=new Set(['installedLaborPercent','installedMaterialsPercent','scopeRates','scopeDetails']);
  const fields=(!mode?meta.fields.filter(field=>!['offering_configuration','scope_configuration'].includes(field.type)):
    [meta.fields.find(field=>field.field==='minimumJob'),{field:'offeringRates',label:'Offering unit prices — '+offeringPriceBaseline(service.serviceType).condition,type:'json',moneyKind:'unit_rate',tree:{depth:1,leafKeys:Object.keys(p.offeringRates||{}),leafMoneyKinds:Object.fromEntries(Object.entries(offeringRateDefinitions(service.serviceType,p)).map(([key,f])=>[key,f.moneyKind]))}}].filter(Boolean));
  const baseFields=fields.filter(field=>!replaced.has(field.field));
  const installedPaths=[...new Set([
    ...Object.keys(installedPriceDefinitions(service.serviceType,p)),
    ...Object.keys(p.installedLaborPercent||{}),
    ...Object.keys(p.installedMaterialsPercent||{})
  ])].sort();
  const shareFields=installedPaths.length?['installedLaborPercent','installedMaterialsPercent'].map(field=>{
    const existing=[...(meta.fields||[]),...(meta.interviewFields||[])].find(item=>item.field===field)||{};
    return {...existing,field,type:'json',requiredAtBase:false,
      label:existing.label||(field==='installedLaborPercent'?'Labor portion of installed prices':'Materials share of installed prices'),
      tree:{...(existing.tree||{}),depth:1,leafKeys:installedPaths}};
  }):[];
  const detailFields=Object.keys(p.scopeDetails||{}).length?[{field:'scopeDetails',label:'Additional scope definitions',type:'preserved_configuration',help:'This structured scope definition is retained for the price option and displayed read-only here. Edit the base scope or remove this tier override explicitly; it is never replaced with an unrelated numeric field.'}]:[];
  return [...baseFields,...shareFields,...scopeFields,...detailFields];
}

export function OfferingEditor(props) {
  return props.service.serviceType.startsWith('FENCING_')?<FenceOfferingEditor {...props}/>:<PaintingOfferingEditor {...props}/>;
}
function PaintingOfferingEditor({service,meta,onChange}) {
  const p=servicePricing(service),mode=p.offeringMode,d=p.offeringDetails||{},rates=p.offeringRates||{},fence=service.serviceType.startsWith('FENCING_'),interior=service.serviceType==='INTERIOR_PAINTING';
  const [gateName,setGateName]=useState(''),[gateError,setGateError]=useState(''),[typeName,setTypeName]=useState(''),[typeError,setTypeError]=useState('');
  const fenceTypes=service.knownOfferings?.fenceType||{};
  const useFenceType=name=>{const chosen=chooseFenceType(service,name);if(chosen.error){setTypeError(chosen.error);return;}onChange(chosen.service);setTypeName('');setTypeError('');};
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
  for(const [key,gate] of Object.entries(d.gates||{}))definitions['gate_'+key]={label:'Installed gate: '+key.replaceAll('_',' '),unit:'gates',priceBasis:'sell_price',moneyKind:'fixed_amount'};
  if(!fence&&mode==='itemized'&&service.priceBasisByCategory?.material==='cost')for(const key of Object.keys(definitions))if(definitions[key].category==='material')delete definitions[key];
  const usedLegacyPrep=mode==='itemized'?['prepLaborPerSqft','prepMaterialPerSqft'].filter(key=>rates[key]!==undefined&&rates[key+'_'+d.surfaceCondition]===undefined):[];
  const unused=Object.keys(rates).filter(key=>!definitions[key]&&!usedLegacyPrep.includes(key));
  function removeRate(key){const next={...rates};delete next[key];set('offeringRates',next);}
  return <section className="editor-section"><h2>Fence and painting offering</h2>
    <Field label="Offering pricing"><Select aria-label="Offering pricing" value={mode||''} onChange={e=>set('offeringMode',e.target.value||undefined)}><option value="" disabled={!!mode}>{meta.requiresOffering?'Choose how you price this offering':'Measured wall pricing — choose to configure an offering'}</option><option value="installed">Complete installed prices</option><option value="itemized">Itemized measured components</option></Select></Field>
    {!mode&&meta.requiresOffering&&<Notice>Choose installed or itemized pricing, then define what the offering includes. Earlier standard rates are retained in your saved price book but cannot quote this work on their own.</Notice>}
    {mode&&<>
      <p>Define one offered job and the prices that cover it. Add another offering for a different {fence?'material or installation scope':'surface, coating or preparation scope'}. These descriptions are shown to customers.</p>
      <Notice>{baselineNote}</Notice>
      {confirmation&&<Notice tone="warning">{confirmation.message}</Notice>}
      {legacyCondition&&<label><input type="checkbox" checked={d.baselinePricesConfirmed===true} onChange={e=>detail('baselinePricesConfirmed',e.target.checked)}/> I confirm these are baseline prices for {baseline.condition}</label>}
      {input('description','Included job description')}
      <>
        {input('substrate','Paintable surface covered')}{input('coating','Coating and product system')}{mode==='installed'&&input('finishCoats','Wall finish coats','select',[1,2,3])}
        {(mode==='installed'||rates.prepLaborPerSqft!==undefined||rates.prepMaterialPerSqft!==undefined)&&input('surfaceCondition',mode==='installed'?'Surface condition covered':'Condition for retained preparation prices','select',['good','fair','poor'])}{input('preparation','Preparation work included')}{input('primerCoats','Wall primer coats included','select',[0,1,2,3])}
        <Notice>{mode==='installed'?'The installed wall price includes the defined finish coats, preparation and primer over the quoted area.':'Finish paint uses the requested coat count. Preparation covers the entire measured painted area at your price for the reported surface condition. Material quantities include the waste settings below. For owner material costs, configure products, package coverage and purchase prices under Additional priced scope.'}</Notice>
        {interior?<>{input('ceilingsOffered','Offer ceiling painting','boolean')}{d.ceilingsOffered&&<>{mode==='installed'&&input('ceilingCoats','Ceiling finish coats','select',[1,2,3])}{input('ceilingPrimerCoats','Ceiling primer coats','select',[0,1,2,3])}</>}{input('trimOffered','Offer trim painting','boolean')}{d.trimOffered&&input('trimDescription','Trim coats, preparation and primer included')}</>:null}
      </>
      <h3>Owner prices for this offering — {baseline.condition}</h3>
      {Object.entries(definitions).map(([key,field])=><Field key={key} label={field.label+(key==='installedTrimPerLF'?'':' — '+baseline.condition)+' ($ per '+field.unit+')'} help={(key==='installedTrimPerLF'?'Trim is priced by measured length. Wall height does not adjust this price.':baselineNote)+' '+(field.priceBasis==='sell_price'?'Complete selling price; no additional markup is applied.':'Uses the configured price basis and tax treatment for '+field.category+'.')}><ExactNumericInput aria-label={field.label+' ($ per '+field.unit+')'} kind={field.moneyKind} value={rates[key]??(key.endsWith('_'+d.surfaceCondition)?rates[key.slice(0,-d.surfaceCondition.length-1)]:undefined)} onChange={value=>{const next={...rates};if(value===undefined){delete next[key];if(key.endsWith('_'+d.surfaceCondition))delete next[key.slice(0,-d.surfaceCondition.length-1)];}else next[key]=value;set('offeringRates',next);}}/></Field>)}
      {!!unused.length&&<><h3>Prices outside this selection</h3><p>These saved prices are retained and do not contribute to this selection. Remove them if they no longer belong to this offering.</p>{unused.map(key=><div key={key}>{key}: {String(rates[key])} <Button variant="quiet" onClick={()=>removeRate(key)}>Remove unused price</Button></div>)}</>}
    </>}
  </section>;
}
