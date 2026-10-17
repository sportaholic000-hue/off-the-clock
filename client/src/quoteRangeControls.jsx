import React from 'react';
import {Field} from './ui.jsx';
import {ExactNumericInput} from './pricebookInputs.jsx';
import {RANGE_FIELDS,RANGE_HELP,SERVICE_RANGE_HELP,resolvedRangeSettings} from '../../server/quoteRangeSettings.js';
export function QuoteRangeControls({defaults,service,onDefault,onService}) {
 const edit=(field,value)=>{const next={...service};if(value===undefined)delete next[field];else next[field]=value;onService(next);};
 return <section aria-label="Separate range buffers"><h3>Separate range buffers</h3><p>{RANGE_HELP}</p>
  {RANGE_FIELDS.map((field,i)=><Field key={field} label={'Business '+(i?'high':'low')+' range buffer (%)'}><ExactNumericInput aria-label={'Business '+(i?'high':'low')+' range buffer (%)'} value={defaults[field]} onChange={value=>onDefault(field,value)}/></Field>)}
  <p>{SERVICE_RANGE_HELP}</p>{RANGE_FIELDS.map((field,i)=><Field key={field} label={'This service '+(i?'high':'low')+' range buffer (%)'}><ExactNumericInput aria-label={'This service '+(i?'high':'low')+' range buffer (%)'} value={service[field]} onChange={value=>edit(field,value)}/></Field>)}
 </section>;
}

export function RangeBufferConfirmation({defaults,service}) {
 const range=resolvedRangeSettings(defaults,service);
 return range?`the ${range.rangeLowPercent}% low and ${range.rangeHighPercent}% high commercial range buffers`:`the ${defaults.rangeBufferPercent}% estimate range buffer`;
}
