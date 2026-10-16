import React from 'react';
import {Field,Select,Button,Notice} from './ui.jsx';
import {ExactNumericInput} from './pricebookInputs.jsx';

// Gate openings occupy a boundary, never part of an infill section's length.
export function FenceRunsInput({field,runs=[],onChange}) {
  const edit=(index,next)=>onChange(runs.map((run,i)=>i===index?next:run));
  return <div className="field-stack"><Notice>Gate openings are not included in section lengths. A boundary without a gate is a corner.</Notice>
    {runs.map((run,i)=><section className="editor-section" key={i}><h4>Run {i+1}</h4>
      <Field label={field.closedQuestion}><Select aria-label={field.closedQuestion+' — run '+(i+1)} value={run.closed===undefined?'':String(run.closed)} onChange={e=>{
        const next={...run,sections:run.sections.map(s=>({...s}))};
        if(e.target.value==='')delete next.closed;else next.closed=e.target.value==='true';
        if(!next.closed&&next.sections.length)delete next.sections.at(-1).gateAfter;
        edit(i,next);
      }}><option value="">Unknown / not supplied</option><option value="true">Yes</option><option value="false">No</option></Select></Field>
      <Field label={field.sectionQuestion}>{run.sections.map((section,j)=><div className="field-stack" key={j}>
        <Field label={'Section '+(j+1)+' (ft)'}><ExactNumericInput aria-label={field.sectionQuestion+' — run '+(i+1)+', section '+(j+1)} value={section.lengthLF} onChange={n=>{
          const next={...section};if(n===undefined)delete next.lengthLF;else next.lengthLF=n;
          edit(i,{...run,sections:run.sections.map((s,k)=>k===j?next:s)});
        }}/></Field>
        {(j<run.sections.length-1||run.closed===true)&&<Field label="Gate after this section"><Select aria-label={'Gate after run '+(i+1)+', section '+(j+1)} value={section.gateAfter||''} onChange={e=>{
          const next={...section};if(e.target.value)next.gateAfter=e.target.value;else delete next.gateAfter;
          edit(i,{...run,sections:run.sections.map((s,k)=>k===j?next:s)});
        }}><option value="">No gate — corner</option>{(field.gateChoices||[]).map(g=><option key={g.value} value={g.value}>{g.label}</option>)}</Select></Field>}
        {run.sections.length>1&&<Button variant="quiet" onClick={()=>{const sections=run.sections.filter((_,k)=>k!==j);if(!run.closed){sections[sections.length-1]={...sections.at(-1)};delete sections.at(-1).gateAfter;}edit(i,{...run,sections});}}>Remove section {j+1}</Button>}
      </div>)}</Field>
      <Button variant="secondary" onClick={()=>edit(i,{...run,sections:[...run.sections,{}]})}>Add straight section</Button>
    </section>)}
  </div>;
}
