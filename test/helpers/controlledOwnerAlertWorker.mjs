// Opt-in preload for the synthetic HTTP fixture only. Routes and dispatchOnce
// remain production code; only automatic scheduling is replaced by IPC ticks.
import {mock} from 'node:test';
import * as actual from '../../server/src/ownerAlertService.js';

if(process.env.NODE_ENV!=='test'||process.env.ALLOW_PROVIDER_WRITES!=='false'||!process.send)throw Error('Synthetic worker control requires disabled provider writes and IPC');
let worker;
mock.module(new URL('../../server/src/ownerAlertService.js',import.meta.url).href,{namedExports:{...actual,createOwnerAlertService(options){
  const service=actual.createOwnerAlertService(options);
  return {...service,start(){worker=service;return async()=>{};}};
}}});
process.on('message',async message=>{
  if(message?.type!=='synthetic-owner-alert-dispatch')return;
  try{
    if(!worker)throw Error('Worker not initialized');
    const result=await worker.dispatchOnce();
    process.send({type:'synthetic-owner-alert-result',id:message.id,processed:result.processed});
  }catch{process.send({type:'synthetic-owner-alert-result',id:message.id,error:'SYNTHETIC_DISPATCH_FAILED'});}
});
