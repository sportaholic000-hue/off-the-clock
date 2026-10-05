import React,{useState} from 'react';
import {Field,Select,TextInput,Textarea,Button} from './ui.jsx';
import {ExactNumericInput,ProductNameInput} from './pricebookInputs.jsx';
import {productKeyFromName} from './pricebookFormatting.js';
import {interviewConfigurationSchema} from '../../server/interviewConfiguration.js';

function ConfigurationInput({schema,value,onChange}){
 const [name,setName]=useState(''),[error,setError]=useState('');
 const map=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
 const write=(key,next)=>{const result={...map};if(next===undefined)delete result[key];else result[key]=next;onChange(result);};
 if(schema.type==='object')return <div>{Object.entries(schema.fields).map(([key,def])=><Field key={key} label={def.label+(def.unit?' ('+def.unit+')':'')}><ConfigurationInput schema={def} value={map[key]} onChange={v=>write(key,v)}/></Field>)}</div>;
 if(schema.type==='map')return <div>
  <p>Configure the entries you offer. Leaving this list empty means none are configured.</p>
  {Object.entries(map).map(([key,item])=>{const def=schema.entries?.[key]||schema.entry;return def?<section className="editor-section" key={key}><h3>{def.label}: {key.replaceAll('_',' ')}</h3><ConfigurationInput schema={def} value={item} onChange={v=>write(key,v)}/><Button variant="quiet" onClick={()=>write(key,undefined)}>Remove entry</Button></section>:null;})}
  {schema.entries?<><Select aria-label={'Add '+schema.label} value={name} onChange={e=>setName(e.target.value)}><option value="">Choose an entry</option>{Object.entries(schema.entries).filter(([key])=>!key.includes('__')).map(([key,def])=><option key={key} value={key} disabled={!!map[key]&&!schema.multiple?.includes(key)}>{def.label}</option>)}</Select><Button variant="secondary" onClick={()=>{if(!name)return;let key=name,index=2;while(map[key])key=name+'__'+index++;write(key,{});setName('');}}>Add entry</Button></>:<><TextInput aria-label="New entry name" value={name} onChange={e=>{setName(e.target.value);setError('');}}/><Button variant="secondary" onClick={()=>{const next=productKeyFromName(name);if(next.error||map[next.key]){setError(next.error||'This entry already exists.');return;}write(next.key,{});setName('');}}>Add entry</Button>{error&&<p role="alert">{error}</p>}</>}
  {value===undefined&&<Button variant="secondary" onClick={()=>onChange({})}>None offered</Button>}
 </div>;
 if(schema.type==='enum'||schema.type==='boolean')return <Select aria-label={schema.label} value={value===undefined?'':String(value)} onChange={e=>onChange(e.target.value===''?undefined:(schema.type==='boolean'?[true,false]:schema.values).find(v=>String(v)===e.target.value))}><option value="">Choose</option>{(schema.type==='boolean'?[true,false]:schema.values).map(v=><option key={String(v)} value={String(v)}>{typeof v==='boolean'?(v?'Yes':'No'):String(v).replaceAll('_',' ')}</option>)}</Select>;
 if(schema.type==='number')return <ExactNumericInput aria-label={schema.label} kind={schema.moneyKind} value={value} onChange={onChange}/>;
 if(schema.slug)return <ProductNameInput aria-label={schema.label} value={value} onChange={onChange}/>;
 return <Textarea aria-label={schema.label} value={value??''} onChange={e=>onChange(e.target.value||undefined)}/>;
}
export default function InterviewConfiguration({definition,pricing,value,onChange}){
 return <ConfigurationInput schema={interviewConfigurationSchema(definition.serviceType,definition.field,pricing,value)} value={value} onChange={onChange}/>;
}
