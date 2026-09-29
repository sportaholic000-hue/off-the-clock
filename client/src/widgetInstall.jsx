import React,{useEffect,useRef,useState} from 'react';
import {api} from './api.js';
import {Button,ErrorMessage,Field,Notice,Select,Textarea} from './ui.jsx';

const guides={
 'Plain HTML':{step:'Paste the script before the closing body tag on each page where you want the launcher.'},
 WordPress:{step:'Use a Custom HTML block for one page, or your approved header/footer insertion method for the whole site. WordPress.com must allow JavaScript on your plan.',url:'https://wordpress.com/support/code/'},
 Wix:{step:'In the published site dashboard, open Settings → Custom Code. Add the snippet to Body – end on the pages you choose. Use site custom code for a floating launcher.',url:'https://support.wix.com/en/article/wix-editor-embedding-custom-code-on-your-site'},
 Squarespace:{step:'Use the footer Code Injection field on a plan that supports scripts. Save the snippet for the pages where you want the launcher.',url:'https://support.squarespace.com/hc/en-us/articles/205815928-Add-custom-code-to-your-site'},
 Shopify:{step:'In a copy of your online-store theme, place the snippet before the closing body tag in the main theme layout. Preview before publishing the edited theme.',url:'https://help.shopify.com/en/manual/online-store/themes/theme-code'},
 GoDaddy:{step:'For GoDaddy WordPress, use the WordPress instructions. Websites + Marketing provides an HTML section for custom code; test the published page because an embedded frame may constrain the launcher or block its allowed origin.',url:'https://www.godaddy.com/en-ca/help/add-html-or-custom-code-to-my-site-27252'},
 Webflow:{step:'Paste the snippet in the site or page Footer code field, before the closing body tag. Publish the page to test it.',url:'https://help.webflow.com/hc/en-us/articles/33961357265299-Custom-code-in-head-and-body-tags'}
};
function Installation({access}) {
 const [platform,setPlatform]=useState('Plain HTML'),[website,setWebsite]=useState(''),[status,setStatus]=useState(''),[checking,setChecking]=useState(false);
 const pending=useRef(null),snippetRef=useRef(null);
 const snippet='<script src="'+window.location.origin+'/widget.js" data-key="'+access.publicKey+'" async></script>';
 const origins=access.allowedOrigins||[];
 useEffect(()=>{
  function received(event){
   const check=pending.current;
   if(!check||event.source!==check.popup||event.origin!==check.origin||event.data?.type!=='otc-widget-installed'||event.data.publicKey!==access.publicKey||event.data.nonce!==check.nonce)return;
   clearTimeout(check.timer);pending.current=null;setChecking(false);setStatus('Installation detected ✓ — the launcher and service connection were verified. Open the form and complete an estimate to check the full flow.');
  }
  window.addEventListener('message',received);
  return ()=>{window.removeEventListener('message',received);if(pending.current)clearTimeout(pending.current.timer);};
 },[access.publicKey]);
 async function copy(){
  try{await navigator.clipboard.writeText(snippet);setStatus('Widget code copied.');}
  catch{snippetRef.current?.focus();snippetRef.current?.select();setStatus('Select and copy the widget code below.');}
 }
 function check(){
  const origin=website||origins[0];
  if(!origins.includes(origin))return;
  if(pending.current)clearTimeout(pending.current.timer);
  const nonce=crypto.randomUUID(),url=new URL(origin);url.searchParams.set('otc_widget_check',nonce);
  const popup=window.open(url.href,'otc-widget-check');
  if(!popup){setStatus('Allow this browser to open your website, then check again.');return;}
  setChecking(true);setStatus('Checking the published website in the new tab…');
  const timer=setTimeout(()=>{pending.current=null;setChecking(false);setStatus('Installation was not detected. Check that the code is published, the exact website origin is allowed, and scripts are permitted by the website builder.');},25000);
  pending.current={popup,origin,nonce,timer};
 }
 return <section className="editor-section" aria-label="Install website widget"><h2>Install your website widget</h2>
  <Field label="Website platform"><Select aria-label="Website platform" value={platform} onChange={event=>setPlatform(event.target.value)}>{Object.keys(guides).map(name=><option key={name}>{name}</option>)}</Select></Field>
  <ol><li>Save your website's exact origin in Allowed website origins above.</li><li>{guides[platform].step}</li><li>Publish your page, then use Check installation below and try a complete estimate.</li></ol>
  {guides[platform].url&&<p><a href={guides[platform].url} target="_blank" rel="noopener noreferrer">{platform} code instructions</a></p>}
  <Field label="Widget code"><textarea ref={snippetRef} className="textarea" readOnly value={snippet} rows={3} spellCheck={false}/></Field>
  <Button onClick={copy}>Copy widget code</Button>
  <Field label="Website to check"><Select aria-label="Website to check" value={website||origins[0]||''} onChange={event=>setWebsite(event.target.value)}>{origins.map(origin=><option key={origin} value={origin}>{origin}</option>)}</Select></Field>
  <Button variant="secondary" onClick={check} disabled={checking||!origins.length}>{checking?'Checking installation':'Check installation'}</Button>
  {status&&<p role="status">{status}</p>}
  <Notice>Install the code on your published website. Some builders restrict scripts or place them inside frames; the checker reports only a verified connection.</Notice>
 </section>;
}
export function QuoteAccess(){
 const [access,setAccess]=useState(null),[origins,setOrigins]=useState(''),[error,setError]=useState(null),[saving,setSaving]=useState(false);
 useEffect(()=>{api('/api/quotedone/access').then(value=>{setAccess(value);setOrigins(value.allowedOrigins.join('\n'));}).catch(setError);},[]);
 async function save(){if(saving)return;setSaving(true);try{const value=await api('/api/quotedone/access',{method:'POST',body:{allowedOrigins:origins.split(/\s+/).filter(Boolean)}});setAccess(value);setError(null);}catch(err){setError(err);}finally{setSaving(false);}}
 return <section className="editor-section"><h2>Customer quote link</h2>
  <Field label="Allowed website origins" help="Enter the exact HTTPS website origins. Local HTTP origins are available only for non-production verification."><Textarea value={origins} onChange={event=>setOrigins(event.target.value)}/></Field>
  <Button variant="secondary" onClick={()=>setOrigins([...new Set([...origins.split(/\s+/).filter(Boolean),window.location.origin])].join('\n'))}>Use this website origin</Button>
  <Button onClick={save} disabled={saving}>{saving?'Saving quote-link access':'Save quote-link access'}</Button>
  {access?.publicKey&&<><p><a href={'/quote/'+access.publicKey} target="_blank" rel="noreferrer">Open customer quote form</a></p><Installation access={access}/></>}
  <ErrorMessage error={error}/>
 </section>;
}
