import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {once} from 'node:events';
import express from 'express';
import {application} from '../../test/fixtures/bookingCalendarApplication20261006.mjs';
import {convertApplicationBook} from '../../server/src/quoteDoneBridge.js';
import {installWidgetAssets} from '../../server/src/productionAssets.js';

export async function serviceApplication(root,out,type,fixture,defaults){
 const cleanup=[],app=await application({after:fn=>cleanup.unshift(fn)}),owner='synthetic-a',wire=[];
 const write=(name,data)=>fs.writeFileSync(path.join(out,name),JSON.stringify(data,null,2));
 async function api(method,url,body){
  const r=await app.request(url,{method,body,owner});
  wire.push({channel:'owner',method,url,body,status:r.status,response:r.body});
  assert.equal(r.status,200,JSON.stringify(r));return r.body;
 }
 try{
  const initial=await api('GET','/api/pricebook/'+owner),service=structuredClone(fixture.ownerPricing);
  for(const key of ['origin','quoteDoneApproval','startingValueState','startingValueAdoptions','dependentLineState'])delete service[key];
  if(type!=='CUSTOM')service.service='[SYNTHETIC WIDGET ENTRY] '+type;
  service.validationInputs=structuredClone(fixture.customerInputs);service.tiers=[];
  const converted=convertApplicationBook({services:[service],defaults:{...defaults,currency:'CAD',quoteTimeZone:'UTC'}},'toDollars');
  await api('POST','/api/pricebook/save',{...initial,services:converted.services,defaults:converted.defaults});
  let saved=await api('GET','/api/pricebook/'+owner);
  for(let pass=0;pass<3;pass++){
   const s=saved.services[0],start=Object.keys(s.startingValueState||{}),dep=Object.keys(s.dependentLineState||{});
   if(!start.length&&!dep.some(id=>!s.dependentLineState[id]?.confirmed||!s.dependentLineState[id]?.reentered))break;
   if(start.length)s.startingValueActions={confirmPaths:start};if(dep.length)s.dependentLineActions={reenteredIds:dep,confirmIds:dep};
   await api('POST','/api/pricebook/save',saved);saved=await api('GET','/api/pricebook/'+owner);
  }
  const validation=await api('POST','/api/pricebook/validate',saved),status=validation.statuses.find(s=>s.serviceId===saved.services[0].id);
  assert.ok(status,'No owner validation status');write('owner-validation.json',validation);
  await api('POST','/api/pricebook/services/'+saved.services[0].id+'/approve',{revision:saved.revision,confirmConfiguration:true,confirmLegacySettings:true,fields:status.confirmationFields||[]});
  const approved=await api('GET','/api/pricebook/'+owner);write('approved-book.json',approved);
  const assets=express();installWidgetAssets(assets,path.join(root,'client/dist'));
  assets.use('/api/public',express.raw({type:()=>true,limit:'1mb'}),async(req,res)=>{
   try{
    const headers={};for(const key of ['origin','content-type','accept','access-control-request-method','access-control-request-headers'])if(req.headers[key])headers[key]=req.headers[key];
    const response=await fetch(app.base+req.originalUrl,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)&&req.body?.length?{body:req.body}:{})});
    const bytes=Buffer.from(await response.arrayBuffer());
    for(const [key,value]of response.headers)if(key==='content-type'||key.startsWith('access-control-'))res.set(key,value);
    wire.push({channel:'public',method:req.method,url:req.originalUrl,origin:req.headers.origin,body:req.body?.length?JSON.parse(req.body.toString()):undefined,status:response.status,response:bytes.length?JSON.parse(bytes.toString()):null});
    res.status(response.status).send(bytes);
   }catch(error){res.status(500).json({syntheticHarnessFailure:error.message});}
  });
  const assetServer=assets.listen(0,'127.0.0.1');await once(assetServer,'listening');cleanup.unshift(()=>new Promise(r=>assetServer.close(r)));
  const assetOrigin='http://127.0.0.1:'+assetServer.address().port;
  let publicKey;
  const embed=express();embed.get('/',(_req,res)=>res.type('html').send('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic widget host</title></head><body><h1>[SYNTHETIC] Widget entry review</h1><script src="'+assetOrigin+'/widget.js" data-key="'+publicKey+'" async></script></body></html>'));
  const embedServer=embed.listen(0,'127.0.0.1');await once(embedServer,'listening');cleanup.unshift(()=>new Promise(r=>embedServer.close(r)));
  const embedOrigin='http://127.0.0.1:'+embedServer.address().port;
  const access=await api('POST','/api/quotedone/access',{allowedOrigins:[embedOrigin,app.base]});publicKey=access.publicKey;
  const publicPath='/api/public/quote/'+publicKey;
  const c=await app.request(publicPath,{publicRequest:true});assert.equal(c.status,200);write('catalog.json',c.body);
  const catalog=c.body.services.find(s=>s.serviceType===type);assert.ok(catalog,`${type} missing from approved public catalog`);
  const counts=()=>Object.fromEntries(['quoteSubmissions','quotes','leads','quoteRequests'].map(table=>[table,app.db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ownerId=?`).get(owner).n]));
  const receipt=id=>app.db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(owner,id);
  const quote=row=>app.db.prepare('SELECT * FROM quotes WHERE ownerId=? AND id=?').get(owner,row.recordId);
  return {app,owner,approved,api,publicKey,publicPath,assetOrigin,embedOrigin,catalog,counts,receipt,quote,wire,
   stop:async()=>{write('http.json',wire);for(const fn of cleanup)await fn();}};
 }catch(error){write('http.json',wire);for(const fn of cleanup)await fn();throw error;}
}
