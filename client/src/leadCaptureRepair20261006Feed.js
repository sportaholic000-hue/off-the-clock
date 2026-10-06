// One read at a time, one timer, no hidden-tab polling. Repeated failures pause
// automatic updates; a stalled read is shown as stale rather than overlapped.
export function startLeadCaptureFeed({read,onData,onError,onSessionChange,session,
  events=globalThis.window,visibility=globalThis.document,
  schedule=setTimeout,cancel=clearTimeout,intervalMs=5000,staleMs=15000,maxFailures=3}) {
  const identity=session();let stopped=false,timer=null,staleTimer=null,pending=false,failures=0;
  const alive=()=>!stopped&&session()===identity;
  const hidden=()=>visibility?.visibilityState==='hidden';
  function stop(){stopped=true;cancel(timer);cancel(staleTimer);events?.removeEventListener('otc:session',changed);events?.removeEventListener('storage',changed);visibility?.removeEventListener('visibilitychange',visible);}
  function changed(){if(!stopped&&session()!==identity){stop();onSessionChange();}}
  function plan(){if(alive()&&!hidden()&&failures<maxFailures){cancel(timer);timer=schedule(tick,Math.min(60000,intervalMs*2**failures));}}
  async function tick(){
    timer=null;if(!alive()){changed();return;}if(hidden()||pending)return;
    pending=true;
    staleTimer=schedule(()=>{if(alive())onError(new Error('Call feed updates are delayed. Refresh after the request finishes, or reload.'));},staleMs);
    try{const data=await read();if(alive()){failures=0;onData(data);}else changed();}
    catch(error){if(alive()){failures++;onError(error);}else changed();}
    finally{pending=false;cancel(staleTimer);staleTimer=null;plan();}
  }
  function visible(){if(hidden()){cancel(timer);timer=null;}else if(!pending&&alive()&&failures<maxFailures){cancel(timer);timer=schedule(tick,0);}}
  events?.addEventListener('otc:session',changed);events?.addEventListener('storage',changed);visibility?.addEventListener('visibilitychange',visible);
  plan();return {stop};
}
