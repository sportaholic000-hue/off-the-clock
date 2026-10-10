import '../../test/pricebookTestEnv.mjs';
import {Session} from 'node:inspector';
import {migrate} from '../../server/src/db.js';
import {applicationMetadata,readApplicationBook,validateApplicationDraft} from '../../server/src/quoteDoneBridge.js';
import {editorServices} from '../../client/src/pricebookEditing.js';

// Expected before execution: no price/book fixture writes are needed to load
// a fresh revision twice and validate it; those three revisions must match.
// Unknown owner prices/fee/tax choices must remain missing, never auto-filled.
migrate();
const owner='[SYNTHETIC]-first-visit-probe',meta=applicationMetadata();
const book=readApplicationBook(owner),second=readApplicationBook(owner);
const services=editorServices([],meta.services,meta.services.map(s=>s.serviceType));
const caught=[];
const inspector=new Session();inspector.connect();
inspector.post('Debugger.enable');
inspector.on('Debugger.paused',({params})=>{caught.push({error:params.data?.description,frames:params.callFrames.slice(0,6).map(f=>({name:f.functionName,url:f.url,line:f.location.lineNumber+1}))});inspector.post('Debugger.resume');});
inspector.post('Debugger.setPauseOnExceptions',{state:'all'});
const result=validateApplicationDraft(owner,{...book,services});
inspector.post('Debugger.setPauseOnExceptions',{state:'none'});inspector.disconnect();
console.log(JSON.stringify({revisions:{first:book.revision,second:second.revision,validation:result.revision},caught,statuses:result.statuses.map(s=>({type:s.serviceType,status:s.status,fields:s.ownerDiagnostics,issues:s.applicationIssues,failed:s.failedTierDiagnostics}))},null,2));
