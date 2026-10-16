import React,{useEffect,useState} from 'react';
import {ExactNumericInput} from './pricebookInputs.jsx';
import {Button,Field,Select} from './ui.jsx';

export function CarpetRoomsInput({rooms,onChange}){
  const rows=Array.isArray(rooms)&&rooms.length?rooms:[{}];
  function edit(i,key,value){const next=rows.map(r=>({...r}));if(value===undefined)delete next[i][key];else next[i][key]=value;onChange(next);}
  return <div>{rows.map((room,i)=><fieldset key={i}><legend>Room {i+1}</legend>
    <Field label="Length, front to back (feet)"><ExactNumericInput aria-label={'Room '+(i+1)+' length, front to back'} value={room.lengthFt} onChange={v=>edit(i,'lengthFt',v)}/></Field>
    <Field label="Width, side to side (feet)"><ExactNumericInput aria-label={'Room '+(i+1)+' width, side to side'} value={room.widthFt} onChange={v=>edit(i,'widthFt',v)}/></Field>
    {rows.length>1&&<Button variant="quiet" onClick={()=>onChange(rows.filter((_,j)=>j!==i))}>Remove room {i+1}</Button>}
  </fieldset>)}<Button variant="secondary" disabled={rows.length>=1000} onClick={()=>onChange([...rows,{}])}>Add room</Button></div>;
}

export function CarpetConnectionsInput({value,rooms=[],onChange}){
  const infer=value==='unknown'?'unknown':Array.isArray(value)?value.every(g=>g.length===1)?'separate':'groups':'';
  const [mode,setMode]=useState(infer),[assignmentDraft,setAssignmentDraft]=useState({roomCount:rooms.length,values:[]});
  const assignments=assignmentDraft.roomCount===rooms.length?assignmentDraft.values:[];
  const setAssignments=values=>setAssignmentDraft({roomCount:rooms.length,values});
  useEffect(()=>{if(value===undefined){setAssignments([]);return;}setMode(infer);if(Array.isArray(value))setAssignments(rooms.map((_,i)=>{const n=value.findIndex(g=>g.includes(i+1));return n<0?'':String(n+1);}));},[value,rooms.length]);
  function choose(mode){setMode(mode);if(mode==='unknown')onChange('unknown');else if(mode==='separate')onChange(rooms.map((_,i)=>[i+1]));else{setAssignments(rooms.map(()=>''));onChange(undefined);}}
  function assign(i,area){const next=rooms.map((_,j)=>j===i?area:assignments[j]||'');setAssignments(next);if(next.some(v=>!v)){onChange(undefined);return;}
    const groups=new Map();next.forEach((group,j)=>{if(!groups.has(group))groups.set(group,[]);groups.get(group).push(j+1);});onChange([...groups.values()]);}
  return <><Select aria-label="Carpet room connections" value={mode} onChange={e=>choose(e.target.value)}><option value="">Choose how rooms connect</option><option value="unknown">Not sure</option><option value="separate">All rooms are separate</option><option value="groups">Some rooms connect</option></Select>
    {mode==='groups'&&rooms.map((_,i)=><Field key={i} label={'Room '+(i+1)+' connected area'}><Select aria-label={'Room '+(i+1)+' connected area'} value={assignments[i]||''} onChange={e=>assign(i,e.target.value)}><option value="">Choose an area</option>{rooms.map((_,j)=><option key={j} value={String(j+1)}>Area {j+1}</option>)}</Select></Field>)}
    <p>Rooms in the same area use the same carpet direction. Not sure treats all rooms as one area.</p>
  </>;
}
