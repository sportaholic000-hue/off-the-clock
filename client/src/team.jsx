import React,{useEffect,useState} from 'react';
import {api} from './api.js';
import {AppShell,Button,ErrorMessage,Field,Loading,Notice,PageHeader,TextInput} from './ui.jsx';

export default function Team() {
  const [state,setState]=useState(null),[name,setName]=useState(''),[email,setEmail]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(null),[message,setMessage]=useState('');
  useEffect(()=>{api('/api/team/staff').then(setState).catch(setError);},[]);
  async function action(path,method='POST',body) {
    setBusy(true);setError(null);setMessage('');
    try {const next=await api(path,{method,body});setState(next);setMessage(method==='DELETE'
      ?path.endsWith('/invite')?'Invitation canceled.':'Staff login removed.'
      :path.endsWith('/resend')?'Invitation resent.':'Invitation sent.');
      if(method==='POST'&&path.endsWith('/invite')){setName('');setEmail('');}}
    catch(next){setError(next);try{setState(await api('/api/team/staff'));}catch{} }finally{setBusy(false);}
  }
  return <AppShell activePath="/team"><main className="team-page">
    <PageHeader eyebrow="YOUR BUSINESS" title="Team" description="Invite office staff to help with calls, leads, quotes, calendar and customers."/>
    <ErrorMessage error={error}/>{message&&<Notice tone="success">{message}</Notice>}
    {!state?<Loading label="Loading team"/>:<>
      <p>Plan: {state.plan}. {state.limit===null?'Unlimited staff seats.':`${state.limit} staff ${state.limit===1?'seat':'seats'}.`}</p>
      {state.staff.map(person=><section className="editor-section" key={person.id}>
        <h2>{person.name}</h2><p>{person.email} · {person.status}</p>
        {person.reason&&<Notice>{person.reason}</Notice>}
        {person.inviteStatus==='pending'&&<>
          <Button variant="secondary" disabled={busy} onClick={()=>action('/api/team/staff/'+encodeURIComponent(person.id)+'/resend')}>Resend invitation</Button>
          <Button variant="secondary" disabled={busy} onClick={()=>action('/api/team/staff/'+encodeURIComponent(person.id)+'/invite','DELETE')}>Cancel invitation</Button>
        </>}
        {person.inviteStatus!=='pending'&&<Button variant="secondary" disabled={busy} onClick={()=>action('/api/team/staff/'+encodeURIComponent(person.id),'DELETE')}>Remove login</Button>}
      </section>)}
      {(state.limit===null||state.staff.length<state.limit)&&<form className="editor-section" onSubmit={event=>{event.preventDefault();action('/api/team/staff/invite','POST',{name,email});}}>
        <h2>Invite office staff</h2><p>They will receive a one-time email link to choose their own password.</p>
        <Field label="Name"><TextInput required maxLength={120} autoComplete="off" value={name} onChange={event=>setName(event.target.value)}/></Field>
        <Field label="Email"><TextInput type="email" required maxLength={254} autoComplete="off" value={email} onChange={event=>setEmail(event.target.value)}/></Field>
        <Button type="submit" disabled={busy}>{busy?'Sending…':'Send invitation'}</Button>
      </form>}
      {state.limit===0&&<Notice>{state.plan==='Starter'
        ?'Starter includes the owner login only. Move to Operator or QuoteDone to add office staff.'
        :'This plan includes no staff seats.'}</Notice>}
    </>}
  </main></AppShell>;
}
