import {ownerAmountCents} from './ownerWorkflowService.js';
import {storedObject} from './ownerRecordViews.js';
const problem=(message,statusCode=400)=>Object.assign(Error(message),{statusCode});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const blank=value=>value===undefined||value===null||value==='';
const empty=()=>({revision:0,actualLaborHours:null,actualLaborCostCents:null,actualMaterialCostCents:null,approvedChanges:[],updatedAt:null});
export function installOwnerJobCostSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS ownerJobCosts (
    ownerId TEXT NOT NULL,quoteId TEXT NOT NULL,revision INTEGER NOT NULL,
    dataJson TEXT NOT NULL,updatedAt TEXT NOT NULL,
    PRIMARY KEY(ownerId,quoteId),FOREIGN KEY(ownerId) REFERENCES users(id));`);
}
export function readOwnerJobCosts(query,ownerId,quoteId) {
  const row=query('SELECT revision,dataJson,updatedAt FROM ownerJobCosts WHERE ownerId=? AND quoteId=?').get(ownerId,quoteId);
  return row?{...storedObject(row.dataJson),revision:row.revision,updatedAt:row.updatedAt}:empty();
}
export function createOwnerJobCostService({database,ownerQuery,clock=()=>new Date()}) {
  const q=sql=>{if(!/\bownerId\b/.test(sql))throw Error('Job cost tenant binding required');return ownerQuery(sql);};
  function quote(ownerId,id,role){
    if(role!=='owner')throw problem('Job costs are available only to the owner.',403);
    const row=q('SELECT id,finalInvoiceAmount FROM quotes WHERE ownerId=? AND id=?').get(ownerId,id);
    if(!row)throw problem('Quote not found.',404);return row;
  }
  function view({ownerId,id,role='owner'}){const row=quote(ownerId,id,role);return {...readOwnerJobCosts(q,ownerId,id),finalInvoiceCents:row.finalInvoiceAmount};}
  function save({ownerId,id,role='owner',body}) {
    return database.transaction(()=>{
      const row=quote(ownerId,id,role);
      if(!object(body)||Object.keys(body).some(key=>!['revision','actualLaborHours','actualLaborCost','actualMaterialCost','approvedChanges'].includes(key))||!Number.isSafeInteger(body.revision)||body.revision<0)throw problem('Supply job costs and the current revision.');
      const current=readOwnerJobCosts(q,ownerId,id);
      if(current.revision!==body.revision)throw problem('Job costs changed. Reload the saved values before editing again.',409);
      let actualLaborHours=null;
      if(!blank(body.actualLaborHours)){
        if(typeof body.actualLaborHours!=='string'||!/^\d{1,7}(?:\.\d{1,4})?$/.test(body.actualLaborHours))throw problem('Enter non-negative labor hours with at most four decimal places.');
        actualLaborHours=Number(body.actualLaborHours);
      }
      const money=value=>blank(value)?null:ownerAmountCents(value);
      if(!Array.isArray(body.approvedChanges)||body.approvedChanges.length>100)throw problem('Supply up to 100 approved change orders.');
      const approvedChanges=body.approvedChanges.map(change=>{
        if(!object(change)||Object.keys(change).sort().join(',')!=='amount,description'||typeof change.description!=='string'||!change.description.trim()||change.description.length>2000||change.description.includes('\u0000'))throw problem('Each approved change needs an amount and description.');
        // Credits are approved scope reductions, separate from the original quote.
        const negative=typeof change.amount==='string'&&change.amount.startsWith('-');
        const amountCents=ownerAmountCents(negative?change.amount.slice(1):change.amount)*(negative?-1:1);
        return {amountCents,description:change.description.trim()};
      });
      const data={actualLaborHours,actualLaborCostCents:money(body.actualLaborCost),actualMaterialCostCents:money(body.actualMaterialCost),approvedChanges};
      const total=approvedChanges.reduce((sum,change)=>sum+BigInt(change.amountCents),0n);
      if(total>BigInt(Number.MAX_SAFE_INTEGER)||total<BigInt(Number.MIN_SAFE_INTEGER))throw problem('Approved change total exceeds the supported limit.');
      if(Number.isSafeInteger(row.finalInvoiceAmount)&&total>BigInt(row.finalInvoiceAmount))throw problem('Approved changes cannot exceed the final invoice.');
      const now=clock().toISOString();
      q(`INSERT INTO ownerJobCosts(ownerId,quoteId,revision,dataJson,updatedAt) VALUES(?,?,?,?,?)
        ON CONFLICT(ownerId,quoteId) DO UPDATE SET revision=excluded.revision,dataJson=excluded.dataJson,updatedAt=excluded.updatedAt`)
        .run(ownerId,id,current.revision+1,JSON.stringify(data),now);
      return view({ownerId,id,role});
    }).immediate();
  }
  return {view,save};
}
