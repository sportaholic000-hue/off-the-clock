import {parentPort} from 'node:worker_threads';

if(!parentPort)throw new Error('Controlled metrics worker requires a parent port.');
parentPort.once('message',async message=>{
  const {taskId,payload={}}=message;
  if(payload.behavior==='throw')throw new Error('SYNTHETIC controlled worker failure');
  if(payload.behavior==='spin'){
    const until=performance.now()+(payload.delayMs||0);
    while(performance.now()<until){}
  }else if(payload.delayMs)await new Promise(resolve=>setTimeout(resolve,payload.delayMs));
  parentPort.postMessage({taskId,ok:true,result:payload.value});
});
