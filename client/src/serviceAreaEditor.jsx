import React from 'react';
import {Button,Field,Select,TextInput} from './ui.jsx';

export function ServiceAreaEditor({value,onChange,disabled=false}) {
  const cities=Array.isArray(value?.cities)?value.cities:[];
  const edit=(index,key,text)=>onChange({mode:'cities',cities:cities.map((city,i)=>i===index?{...city,[key]:text}:city)});
  return <fieldset className="review-contact" disabled={disabled}>
    <legend>Service area</legend>
    <p>Choose all areas or list 1–100 cities. Your receptionist and website booking check this saved area. About &amp; area does not set booking coverage.</p>
    <Field label="Where do you work?"><Select aria-label="Where do you work?" value={value?.mode||''} onChange={event=>onChange(event.target.value==='all'?{mode:'all',cities:[]}:{mode:'cities',cities:cities.length?cities:[{city:'',region:'',country:''}]})}>
      <option value="" disabled>Choose service area</option><option value="all">All areas</option><option value="cities">Specific cities</option>
    </Select></Field>
    {value?.mode==='cities'&&<>
      <p>Enter the city, province or state, and a two-letter country code, such as CA or US. Each city must be unique.</p>
      {cities.map((city,index)=><div className="kb-grid" key={index}>
        <Field label={`City ${index+1}`}><TextInput required maxLength={100} value={city.city} onChange={event=>edit(index,'city',event.target.value)}/></Field>
        <Field label={`Province/state ${index+1}`}><TextInput required maxLength={64} value={city.region} onChange={event=>edit(index,'region',event.target.value)}/></Field>
        <Field label={`Country code ${index+1}`}><TextInput required maxLength={2} value={city.country} onChange={event=>edit(index,'country',event.target.value)}/></Field>
        <Button variant="secondary" aria-label={`Remove city ${index+1}`} onClick={()=>onChange({mode:'cities',cities:cities.filter((_,i)=>i!==index)})}>Remove city</Button>
      </div>)}
      <Button variant="secondary" disabled={cities.length>=100} onClick={()=>onChange({mode:'cities',cities:[...cities,{city:'',region:'',country:''}]})}>Add city</Button>
    </>}
  </fieldset>;
}
