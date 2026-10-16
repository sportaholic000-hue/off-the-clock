import React from 'react';
import {Button,Field,Select,TextInput} from './ui.jsx';
import {ExactNumericInput} from './pricebookInputs.jsx';
import {STOCK_LABELS} from '../../server/quote-engine-vnext/concreteLandscapePricing.js';

export function PlantSizesEditor({value,onChange}){
  const sizes=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const set=(key,field,next)=>{
    const row={...sizes[key]};
    if(next===undefined||next==='')delete row[field];else row[field]=next;
    if(field==='plantType'){delete row.containerNumber;delete row.caliperInches;delete row.heightFt;}
    onChange({...sizes,[key]:row});
  };
  return <div className="field-stack">{Object.entries(sizes).map(([key,row],index)=><fieldset key={key}>
    <legend>Plant size {index+1}</legend>
    <Field label="Customer size name"><TextInput aria-label={'Customer size name '+(index+1)} value={row.name||''} onChange={e=>set(key,'name',e.target.value)}/></Field>
    <Field label="Plant type"><Select aria-label={'Plant type '+(index+1)} value={row.plantType||''} onChange={e=>set(key,'plantType',e.target.value)}><option value="">Choose</option><option value="shrub">Shrub</option><option value="tree">Tree</option></Select></Field>
    <Field label="Stock type"><Select aria-label={'Stock type '+(index+1)} value={row.stockType||''} onChange={e=>set(key,'stockType',e.target.value)}><option value="">Choose</option>{Object.entries(STOCK_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select></Field>
    {row.plantType==='shrub'&&<Field label="Container number"><ExactNumericInput aria-label={'Container number '+(index+1)} value={row.containerNumber} onChange={v=>set(key,'containerNumber',v)}/></Field>}
    {row.plantType==='tree'&&<><Field label="Tree caliper (inches)"><ExactNumericInput aria-label={'Tree caliper (inches) '+(index+1)} value={row.caliperInches} onChange={v=>set(key,'caliperInches',v)}/></Field><Field label="Tree height (feet)" help="Enter caliper or height, not both."><ExactNumericInput aria-label={'Tree height (feet) '+(index+1)} value={row.heightFt} onChange={v=>set(key,'heightFt',v)}/></Field></>}
    <Button variant="quiet" onClick={()=>{const next={...sizes};delete next[key];onChange(Object.keys(next).length?next:undefined);}}>Remove plant size {index+1}</Button>
  </fieldset>)}<Button variant="secondary" disabled={Object.keys(sizes).length>=32} onClick={()=>{let n=1;while(Object.hasOwn(sizes,'size_'+n))n++;onChange({...sizes,['size_'+n]:{}});}}>Add plant size</Button>
  <small>After adding or removing sizes, update the matching planting labor and material allowance prices.</small></div>;
}

export function PlantSizePrices({pricing,field,value,onChange}){
  const sizes=pricing.plantSizes||{},prices=value||{};
  const keys=[...new Set([...Object.keys(sizes),...Object.keys(prices)])];
  return <div className="field-stack">{keys.map(key=><Field key={key} label={sizes[key]?.name||key}>
    <ExactNumericInput aria-label={field.label+' '+(sizes[key]?.name||key)} kind="fixed_amount" value={prices[key]} onChange={v=>{const next={...prices};if(v===undefined)delete next[key];else next[key]=v;onChange(Object.keys(next).length?next:undefined);}}/>
    {!sizes[key]&&<Button variant="quiet" onClick={()=>{const next={...prices};delete next[key];onChange(Object.keys(next).length?next:undefined);}}>Remove retired size price</Button>}
  </Field>)}</div>;
}
