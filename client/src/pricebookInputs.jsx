import React, { useEffect, useRef, useState } from 'react';
import { parseOwnerNumericInput, scaleOwnerDecimal } from '../../server/priceBookMoney.js';
import { TextInput, Button, Field } from './ui.jsx';

// Keep entered decimal text while editing. Invalid text stays in the draft,
// so switching services cannot silently save an earlier accepted replacement.
export function ExactNumericInput({ value, onChange, kind = null, wholeCents = false, ...props }) {
  const [raw, setRaw] = useState(value === undefined || value === null ? '' : String(value));
  const [error, setError] = useState('');
  const emitted = useRef(value);
  useEffect(() => {
    const next = value === undefined || value === null ? '' : String(value);
    if (!Object.is(value, emitted.current)) {
      emitted.current = value;
      setRaw(next);
    }
    try { parseOwnerNumericInput(next, { kind, wholeCents }); setError(''); }
    catch (problem) { setError(problem.message); }
  }, [value, kind, wholeCents]);
  function change(text) {
    setRaw(text);
    try {
      const number = parseOwnerNumericInput(text, { kind, wholeCents });
      setError('');
      emitted.current = number;
      onChange(number);
    } catch (problem) {
      setError(problem.message);
      emitted.current = text;
      onChange(text);
    }
  }
  return <>
    <TextInput {...props} type="text" inputMode="decimal" value={raw}
      aria-invalid={Boolean(error)} onChange={event => change(event.target.value)} />
    {error && <span className="field-error" role="alert">{error}</span>}
  </>;
}

// Saved waste remains a fraction; the owner enters the familiar percentage.
export function WastePercentInput({value,onChange,...props}) {
 let shown=value;
 try { shown=scaleOwnerDecimal(value,2); } catch { /* preserve rejected value */ }
 return <ExactNumericInput {...props} value={shown} onChange={number=>{
   try { onChange(scaleOwnerDecimal(number,-2)); }
   catch { onChange(String(number)); }
 }}/>;
}

// The decimal-foot value remains unchanged until the user edits a dimension.
// Both owner and customer use this same conversion, including decimal inches.
export function FenceHeightInput({value,onChange,label='Fence height'}) {
 const [split,setSplit]=useState(false),[parts,setParts]=useState({feet:'',inches:''});
 const emitted=useRef(value);
 const unpack=v=>typeof v==='number'?{feet:String(Math.floor(v)),inches:String(Number(((v-Math.floor(v))*12).toPrecision(12)))}:{feet:v===undefined?'':String(v),inches:''};
 useEffect(()=>{if(!Object.is(value,emitted.current)){emitted.current=value;setParts(unpack(value));}},[value]);
 function change(key,next){
  const draft={...parts,[key]:next===undefined?'':String(next)};setParts(draft);
  let result;
  try {const feet=parseOwnerNumericInput(draft.feet),inches=parseOwnerNumericInput(draft.inches)||0;
   if(feet===undefined&&draft.inches==='')result=undefined;
   else if(feet===undefined||!Number.isInteger(feet)||inches>=12)throw Error('Enter whole feet and inches below 12.');
   else result=feet+inches/12;
  }catch {result=draft.feet+' ft '+draft.inches+' in';}
  emitted.current=result;onChange(result);
 }
 return <div>{split?<><Field label="Whole feet"><ExactNumericInput aria-label={label+' whole feet'} value={parts.feet} onChange={v=>change('feet',v)}/></Field><Field label="Inches (decimals allowed)"><ExactNumericInput aria-label={label+' inches'} value={parts.inches} onChange={v=>change('inches',v)}/></Field>{typeof value==='string'&&<span role="alert">Enter whole feet and inches from 0 up to, but not including, 12.</span>}</>:<ExactNumericInput aria-label={label} value={value} onChange={onChange}/>}
 <Button variant="quiet" onClick={()=>{if(!split)setParts(unpack(value));setSplit(!split);}}>{split?'Enter decimal feet':'Enter feet and inches'}</Button>
 <small>Any positive height, including fractional inches.</small></div>;
}
