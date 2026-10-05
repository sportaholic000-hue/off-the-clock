// Attach only the voice upgrade path to the HTTP server supplied by the entry point.
export class VoiceWebSocketServerError extends Error{constructor(code){super('Voice WebSocket configuration is invalid.');this.name='VoiceWebSocketServerError';this.code=code;}}
const fail=code=>{throw new VoiceWebSocketServerError(code);};
const NONCE=/^[A-Za-z0-9_-]{32,200}$/;
export function createVoiceWebSocketServer({httpServer,coordinator,WebSocketServer,webSocketServer,maxPayload=32768,streamPath='/api/twilio/voice/stream',onError=()=>{}}={}){
  if(!httpServer||typeof httpServer.on!=='function'||typeof httpServer.removeListener!=='function')fail('HTTP_SERVER_REQUIRED');
  if(!coordinator||typeof coordinator.authorizeUpgrade!=='function'||typeof coordinator.startAuthorizedSession!=='function')fail('VOICE_COORDINATOR_REQUIRED');
  if(!Number.isSafeInteger(maxPayload)||maxPayload<1||maxPayload>1048576)fail('INVALID_VOICE_MAX_PAYLOAD');
  if(WebSocketServer&&webSocketServer)fail('VOICE_WEBSOCKET_SERVER_AMBIGUOUS');
  if(typeof streamPath!=='string'||!/^\/[A-Za-z0-9_/-]+$/.test(streamPath)||streamPath.endsWith('/'))fail('INVALID_VOICE_STREAM_PATH');
  if(!webSocketServer&&typeof WebSocketServer!=='function')fail('VOICE_WEBSOCKET_SERVER_REQUIRED');
  const wss=webSocketServer||new WebSocketServer({noServer:true,maxPayload,perMessageDeflate:false});
  const claimed=new WeakSet(),sessions=new Map(),pending=new Set();let closed=false,closing=null;
  function report(code){try{onError(code);}catch{}}
  function reject(socket){try{socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');}finally{socket.destroy();}}
  function closeSocket(socket,code,reason){try{socket.close(code,reason);}catch{try{socket.terminate?.();}catch{}}}
  function track(promise){pending.add(promise);promise.finally(()=>pending.delete(promise)).catch(()=>{});return promise;}
  async function dispose(socket,entry){if(entry.disposed)return;entry.disposed=true;sessions.delete(socket);try{await entry.controller?.close?.({reason:'VOICE_TRANSPORT_CLOSED'});}catch{report('VOICE_SESSION_CLOSE_FAILED');}}
  async function start(authorization,socket,request){
    if(closed){closeSocket(socket,1012,'Service restarting');return;}
    const entry={controller:null,disposed:false};sessions.set(socket,entry);
    const end=()=>{void track(dispose(socket,entry));};socket.once('close',end);socket.once('error',end);
    try{
      const result=await coordinator.startAuthorizedSession({authorization,socket,request});entry.controller=result?.controller||result;
      if(entry.disposed||closed){try{await entry.controller?.close?.({reason:'VOICE_TRANSPORT_CLOSED'});}catch{report('VOICE_SESSION_CLOSE_FAILED');}sessions.delete(socket);}
    }catch{sessions.delete(socket);entry.disposed=true;socket.removeListener('close',end);socket.removeListener('error',end);closeSocket(socket,1011,'Session unavailable');report('VOICE_SESSION_START_FAILED');}
  }
  function upgrade(request,socket,head){
    const path=String(request.url||'');
    if(path!==streamPath&&!path.startsWith(streamPath+'/')&&!path.startsWith(streamPath+'?')&&!path.startsWith(streamPath+'#'))return;
    if(claimed.has(socket))return;claimed.add(socket);const nonce=path.slice(streamPath.length+1);
    if(closed||!path.startsWith(streamPath+'/')||!NONCE.test(nonce)){reject(socket);return;}
    let authorization;try{authorization=coordinator.authorizeUpgrade({signature:request.headers?.['x-twilio-signature'],requestPath:path});}catch{report('VOICE_WEBSOCKET_AUTHORIZATION_FAILED');reject(socket);return;}
    const task=Promise.resolve(authorization).then(grant=>{
      if(closed||socket.destroyed){if(!socket.destroyed)reject(socket);return;}
      let accepted=null;
      try{wss.handleUpgrade(request,socket,head,ws=>{if(accepted){if(accepted!==ws)closeSocket(ws,1008,'Duplicate session');return;}accepted=ws;track(start(grant,ws,request));});}catch{report('VOICE_WEBSOCKET_UPGRADE_FAILED');if(!accepted)reject(socket);}
    },()=>{report('VOICE_WEBSOCKET_AUTHORIZATION_FAILED');reject(socket);});track(task);
  }
  const serverError=()=>report('VOICE_WEBSOCKET_SERVER_ERROR');wss.on('error',serverError);httpServer.on('upgrade',upgrade);
  const whenIdle=async()=>{while(pending.size)await Promise.allSettled([...pending]);};
  function close(){
    if(closing)return closing;closed=true;httpServer.removeListener('upgrade',upgrade);
    closing=Promise.resolve().then(async()=>{
      await whenIdle();
      await Promise.all([...sessions].map(async([socket,entry])=>{closeSocket(socket,1012,'Service restarting');await dispose(socket,entry);}));
      await new Promise(resolve=>{try{wss.close(resolve);}catch{resolve();}});wss.removeListener('error',serverError);
    });return closing;
  }
  return Object.freeze({get activeSessionCount(){return sessions.size;},get closed(){return closed;},whenIdle,close});
}
