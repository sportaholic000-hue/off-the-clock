import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {application} from '../../test/fixtures/bookingCalendarApplication20261006.mjs';
import {offeringFixture} from '../../test/configuredOfferingsFixtures.mjs';
import {convertApplicationBook} from '../../server/src/quoteDoneBridge.js';

// Reuses A3's actual HTTP probe, pinned to the requested pristine integration.
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),'e50c9f58459a4362537eb5da5dc1cf082fbc3ca8');
assert.equal(execFileSync('git',['diff','--','server'],{encoding:'utf8'}),'');
const root=path.resolve(process.argv[2]||'.');
const out=path.resolve(process.argv[3]||path.join(root,'verification/qe-agent1-interior-activation-20261019/before'));
if(fs.existsSync(out))throw Error('Evidence directory already exists: '+out);
fs.mkdirSync(out,{recursive:true});
const write=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2));
const cleanup=[],t={after:fn=>cleanup.unshift(fn)},wire=[];
let app;
try{
  app=await application(t);
  const owner='synthetic-a';
  async function call(method,url,body,{publicRequest=false,status=200}={}){
    const response=await app.request(url,{method,body,owner:publicRequest?null:owner,publicRequest});
    wire.push({method,url,request:body??null,status:response.status,response:response.body});
    assert.equal(response.status,status,`${method} ${url}: ${JSON.stringify(response.body)}`);
    return response.body;
  }

  const fixture=offeringFixture('INTERIOR_PAINTING','installed');
  const service=structuredClone(fixture.ownerPricing);
  for(const key of ['origin','quoteDoneApproval','startingValueState','startingValueAdoptions','dependentLineState'])delete service[key];
  service.service='[SYNTHETIC PUBLIC INTAKE ACTIVATION] INTERIOR_PAINTING';
  service.validationInputs=structuredClone(fixture.customerInputs);
  service.tiers=[];
  const initial=await call('GET','/api/pricebook/'+owner);
  const converted=convertApplicationBook({services:[service],defaults:{...fixture.businessDefaults,currency:'CAD',quoteTimeZone:'UTC'}},'toDollars');
  await call('POST','/api/pricebook/save',{...initial,services:converted.services,defaults:converted.defaults});
  let saved=await call('GET','/api/pricebook/'+owner);
  for(let pass=0;pass<3;pass++){
    const current=saved.services[0],start=Object.keys(current.startingValueState||{}),dependent=Object.keys(current.dependentLineState||{});
    if(!start.length&&!dependent.length)break;
    if(start.length)current.startingValueActions={confirmPaths:start};
    if(dependent.length)current.dependentLineActions={reenteredIds:dependent,confirmIds:dependent};
    await call('POST','/api/pricebook/save',saved);
    saved=await call('GET','/api/pricebook/'+owner);
  }
  const validation=await call('POST','/api/pricebook/validate',saved),before=validation.statuses[0];
  assert.equal(before.serviceType,'INTERIOR_PAINTING');
  await call('POST','/api/pricebook/services/'+saved.services[0].id+'/approve',{revision:saved.revision,confirmConfiguration:true,confirmLegacySettings:true,fields:before.confirmationFields||[]});
  saved=await call('GET','/api/pricebook/'+owner);
  const after=(await call('POST','/api/pricebook/validate',saved)).statuses[0];
  assert.equal(after.approvalCurrent,true,'control: owner approval should be current');
  assert.equal(after.status,'NEEDS PRICING');
  assert.deepEqual(after.invalidOwnerFields,['customerInputs.trimCoats','customerInputs.trimSurfaceCondition']);
  const access=await call('POST','/api/quotedone/access',{allowedOrigins:[app.base]});
  const catalog=await call('GET','/api/public/quote/'+access.publicKey,undefined,{publicRequest:true});
  assert.equal(catalog.services.some(item=>item.serviceType==='INTERIOR_PAINTING'),false);

  const evidence={
    findingId:'PI-00',serviceType:'INTERIOR_PAINTING',configuration:'new installed offering with ceiling and trim prices',
    ownerApprovalCurrent:after.approvalCurrent,status:after.status,invalidOwnerFields:after.invalidOwnerFields,
    activationDiagnostics:after.ownerDiagnostics,publicCatalogServiceTypes:catalog.services.map(item=>item.serviceType),
    expected:'A syntactically complete installed offering whose starting values were explicitly confirmed and whose saved configuration was approved is eligible for its configured wall, ceiling and trim scope.',
    actual:'Activation replays the valid trim inputs against a contract that rejects trimCoats and trimSurfaceCondition; the approved service remains NEEDS PRICING and is omitted from the public catalog.',
    isolation:'The all-20 public matrix uses an independently disclosed wall-only installed offering so this availability defect does not erase coverage for INTERIOR_PAINTING.'
  };
  write('approved-book.json',JSON.parse(fs.readFileSync(path.join(path.dirname(app.path),'pricebooks',owner+'.json'),'utf8')));
  write('finding.json',evidence);write('wire.json',wire);
  write('source-binding.json',{head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),branch:execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'}).trim(),node:process.version,liveProviders:false});
  write('result.json',{status:'passed',reproduced:true,findingId:evidence.findingId});
  console.log(JSON.stringify({status:'passed',reproduced:true,findingId:evidence.findingId}));
}catch(error){
  write('wire.json',wire);write('result.json',{status:'failed',error:error.stack});console.error(error.stack);process.exitCode=1;
}finally{
  for(const fn of cleanup)try{await fn();}catch(error){console.error('cleanup:',error.stack);process.exitCode=1;}
}
