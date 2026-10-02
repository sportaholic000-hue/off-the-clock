import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {startApplication} from '../../client/test/widget-application-harness.mjs';import {convertApplicationBook} from '../../server/src/quoteDoneBridge.js';import {roofMinimum} from './fixtures.mjs';
const out=path.resolve(process.argv[2]),app=await startApplication(process.cwd(),path.join(out,'private'),{port:4982}),rows=[];fs.mkdirSync(path.join(out,'public'),{recursive:true});
try{
 const owner=await app.owner('legacy-fraction'),f=roofMinimum(),service=convertApplicationBook({services:[f.ownerPricing],defaults:f.businessDefaults},'toDollars').services[0];for(const k of ['origin','approvedValues','confirmedFields'])delete service[k];service.id=crypto.randomUUID();service.pricing.minimumJob=2500.5;
 let book=(await app.request('GET','/api/pricebook/'+owner.id,undefined,owner.token)).result;Object.assign(book,{services:[service],defaults:convertApplicationBook({services:[],defaults:f.businessDefaults},'toDollars').defaults});
 rows.push(await app.request('POST','/api/pricebook/save',book,owner.token));
 const file=path.join(out,'private/pricebooks',owner.id+'.json'),stored=JSON.parse(fs.readFileSync(file,'utf8'));stored.services[0].pricing.minimumJob=2500.5;fs.writeFileSync(file,JSON.stringify(stored));
 rows.push(await app.request('GET','/api/pricebook/'+owner.id,undefined,owner.token));fs.writeFileSync(path.join(out,'public/result.json'),JSON.stringify({source:process.env.READINESS_SOURCE,stored,rows},null,2));console.log(JSON.stringify({status:rows[1].status,response:rows[1].result}));
}finally{await app.stop();}
