/* Off The Clock AI embed loader. The shared form sends requests to the originating service. */
(function () {
  'use strict';
  var script=document.currentScript;
  var key=script&&script.getAttribute('data-key');
  if(!script||!key||!/^[A-Za-z0-9_-]{16,128}$/.test(key))return;
  var source=new URL(script.src,document.baseURI);
  if(source.protocol!=='https:'&&!(source.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(source.hostname)))return;
  function start(){
  if(document.querySelector('[data-otc-widget="'+key+'"]'))return;
  var host=document.createElement('div');host.setAttribute('data-otc-widget',key);
  var shadow=host.attachShadow({mode:'open'});
  var style=document.createElement('style');
  style.textContent=':host{all:initial!important;position:fixed!important;right:20px!important;bottom:20px!important;z-index:2147483000!important;color-scheme:dark}*{box-sizing:border-box}button{font:600 16px/1.4 system-ui,sans-serif;cursor:pointer;min-height:48px}button:focus-visible,a:focus-visible{outline:3px solid white;outline-offset:4px}.launcher{background:#00E676;color:#000;border:2px solid #0A0A0A;border-radius:999px;padding:14px 22px;box-shadow:0 5px 22px #0005}.panel{position:fixed;inset:auto 16px 84px auto;margin:0;padding:0;width:420px;max-width:calc(100vw - 24px);height:740px;max-height:calc(100dvh - 108px);border:1px solid #778277;border-radius:16px;background:#0A0A0A;color:#F2F5F2;box-shadow:0 12px 48px #0008;overflow:hidden}.panel::backdrop{background:#0006}.panel[open]{display:flex;flex-direction:column}.top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid #394239;font:600 15px/1.4 system-ui,sans-serif}.close{background:transparent;color:white;border:1px solid #778277;border-radius:8px;padding:8px 12px}.widget-scroll{overflow:auto;overscroll-behavior:contain;min-height:0;flex:1}.load-state{padding:24px;font:16px/1.5 system-ui,sans-serif}.load-state button{background:#00E676;color:#000;border:0;border-radius:8px;padding:12px 16px}.powered{padding:10px;text-align:center;border-top:1px solid #394239;font:12px/1.4 system-ui,sans-serif;color:#B5BDB5}@media(max-width:480px){.panel{inset:auto 12px 12px 12px;width:auto;max-height:calc(100dvh - 24px);height:calc(100dvh - 24px)}}';
  var launcher=document.createElement('button');launcher.className='launcher';launcher.type='button';launcher.textContent='Get an estimate';launcher.setAttribute('aria-haspopup','dialog');launcher.setAttribute('aria-expanded','false');
  var panel=document.createElement('dialog');panel.className='panel';panel.setAttribute('aria-label','Request an estimate');
  var top=document.createElement('div');top.className='top';
  var title=document.createElement('span');title.textContent='Off The Clock AI';
  var close=document.createElement('button');close.className='close';close.type='button';close.textContent='Close';close.setAttribute('aria-label','Close estimate form');top.append(title,close);
  var scroll=document.createElement('div');scroll.className='widget-scroll';
  var body=document.createElement('div');scroll.append(body);
  var footer=document.createElement('div');footer.className='powered';footer.textContent='Powered by Off The Clock AI';
  panel.append(top,scroll,footer);shadow.append(style,launcher,panel);document.body.append(host);
  var loaded=false,loading=false;
  function shut(){panel.close();launcher.setAttribute('aria-expanded','false');launcher.focus();}
  close.addEventListener('click',shut);panel.addEventListener('cancel',function(event){event.preventDefault();shut();});
  async function load(){
    if(loaded||loading)return;loading=true;body.className='load-state';body.textContent='Loading estimate form…';
    try{
      var module=await import(new URL('widget-app.js',source).href);
      body.textContent='';body.className='';
      module.mountWidget(body,{publicKey:key,origin:source.origin,onBranding:function(brand){title.textContent=brand.businessName;launcher.textContent=brand.launcherLabel;}});
      loaded=true;
    }catch(error){
      body.textContent='The estimate form could not load. Please try again. ';
      var retry=document.createElement('button');retry.type='button';retry.textContent='Retry loading form';retry.addEventListener('click',load);body.append(retry);
    }finally{loading=false;}
  }
  launcher.addEventListener('click',function(){if(!panel.open)panel.showModal();launcher.setAttribute('aria-expanded','true');close.focus();load();});
  // Explicit owner-initiated installation check. No customer input is included.
  var nonce=new URL(location.href).searchParams.get('otc_widget_check');
  if(nonce&&/^[a-f0-9-]{36}$/i.test(nonce)&&window.opener){
    fetch(source.origin+'/api/public/quote/'+encodeURIComponent(key),{credentials:'omit',headers:{accept:'application/json'}}).then(function(response){if(!response.ok)throw Error();return response.json();}).then(function(value){
      if(Array.isArray(value.services))window.opener.postMessage({type:'otc-widget-installed',publicKey:key,nonce:nonce},source.origin);
    }).catch(function(){});
  }
  }
  if(document.body)start();else document.addEventListener("DOMContentLoaded",start,{once:true});
})();
