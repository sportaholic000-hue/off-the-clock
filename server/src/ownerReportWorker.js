import {parentPort} from 'node:worker_threads';
import {calculateOwnerReport} from './ownerReportCalculation.js';

if(!parentPort)throw new Error('Owner report worker requires a parent port.');
parentPort.once('message',message=>{
  const taskId=message?.taskId;
  try{parentPort.postMessage({taskId,ok:true,result:calculateOwnerReport(message?.payload||{})});}
  catch(error){parentPort.postMessage({taskId,ok:false,error:{name:error?.name||'Error',message:error?.message||'Owner report calculation failed.',code:error?.code}});}
});
