import React,{useEffect,useState} from 'react';
import {api} from './api.js';
import {Button,ErrorMessage,Notice} from './ui.jsx';

export function VoiceAdmissionAlerts({voice}){
  return <section className="editor-section" aria-label="Voice admission alerts"><h2>Voice admission alerts</h2>
    {voice?.circuit?.openUntil>Date.now()&&<Notice title="Voice provider paused">New calls use request capture while the provider recovers.</Notice>}
    {voice?.alerts?.map((alert,index)=><div key={index}><p>{alert.code} · {alert.resolvedAt?'Resolved':'Needs review'} · {alert.updatedAt}</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(alert.details,null,2)}</pre></div>)}
    {voice?.alerts?.length===0&&<p>No admission alerts recorded.</p>}
  </section>;
}
export default function VoiceAdmin(){
  const [voice,setVoice]=useState(null),[error,setError]=useState(null);
  async function refresh(){try{setVoice((await api('/api/admin')).voice);setError(null);}catch(e){setError(e);}}
  useEffect(()=>{void refresh();},[]);
  return <><Button variant="secondary" onClick={refresh}>Refresh voice alerts</Button><ErrorMessage error={error}/><VoiceAdmissionAlerts voice={voice}/></>;
}
