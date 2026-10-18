import './pricebookTestEnv.mjs';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {reviewRows} from '../client/src/pricebookReview.js';
import {interviewDefinition} from '../client/src/interviewStructuredValue.js';
import {applicationMetadata} from '../server/src/quoteDoneBridge.js';
import {ROOF_MATERIAL_COPY_BY_ACCESSORY_MODE,roofMaterialPresentationCopy} from '../server/priceBookCopy.js';
import {roofDependentDefinitionsVNext,roofFlashingVentDefinitionVNext,synchronizeDependentLinesVNext} from '../server/quote-engine-vnext/priceGroundwork.js';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../server/quote-engine-vnext/engine.js';
import {mergePricingVNext} from '../server/quote-engine-vnext/pricingMerge.js';
import {customerReceiptPresentation} from '../server/src/quoteScopeDisclosure.js';
import {projectSavedQuoteContext,projectVoiceQuote} from '../server/src/voice/voiceQuotePresentation.js';
import {fixture} from '../verification/engine-independent/fixtures.mjs';
import {mowingFixture} from './landscapeLaneB20261016Fixture.mjs';
import {webQuote,db} from './quoteDeliveryBatch20261015Fixture.mjs';
import {accessoryRoof} from '../verification/qe-agent1-core-accuracy-20261018/fixtures.mjs';

const NOW='2026-10-18T12:00:00.000Z';
let browser,bundle;

before(async()=>{
  const pricebookSource=await readFile(new URL('../client/src/pricebook.jsx',import.meta.url),'utf8');
  const exposePricebook={name:'agent3-pricebook-exports',setup(builder){
    builder.onLoad({filter:/client[/\\]src[/\\]pricebook\.jsx$/},()=>({
      contents:pricebookSource+'\nexport {OwnerField as TestOwnerField,PricingContext as TestPricingContext,Preview as TestPreview,TierBuilder as TestTierBuilder,RoofDependentLineNotice as TestRoofDependentLineNotice};',
      loader:'jsx',resolveDir:new URL('../client/src/',import.meta.url).pathname
    }));
  }};
  const built=await build({
    bundle:true,write:false,format:'iife',platform:'browser',plugins:[exposePricebook],
    define:{'process.env.NODE_ENV':JSON.stringify('production'),'import.meta.env':JSON.stringify({})},
    stdin:{loader:'jsx',resolveDir:process.cwd(),contents:`
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import {flushSync} from 'react-dom';
      import StructuredPricingQuestion from './client/src/interviewStructured.jsx';
      import {interviewDefinition} from './client/src/interviewStructuredValue.js';
      import {SavedApproval} from './client/src/quoteDoneControls.jsx';
      import {QuoteResult} from './client/src/quotedone.jsx';
      import {mergePricingVNext} from './server/quote-engine-vnext/pricingMerge.js';
      import {TestOwnerField,TestPricingContext,TestPreview,TestTierBuilder,TestRoofDependentLineNotice} from './client/src/pricebook.jsx';
      function Roof({definition,service,compact=false,tierName}){const tier=service.tiers?.find(candidate=>candidate.name===tierName),pricing=tier?mergePricingVNext(service.pricing,tier.overrides||{}):service.pricing,context={...service,pricing,...(tierName===undefined?{}:{pricingTierName:tierName})};return <TestPricingContext.Provider value={context}><TestOwnerField definition={definition} value={pricing.materialCostPerSquare} onChange={()=>{}} compact={compact}/></TestPricingContext.Provider>;}
      function RoofTiers({definition,service}){return <TestPricingContext.Provider value={service}><TestTierBuilder tiers={service.tiers||[]} definitions={[definition]} onChange={()=>{}}/></TestPricingContext.Provider>;}
      function RoofNotice({service}){return <TestRoofDependentLineNotice service={service} onConfirm={id=>{window.agent3RoofConfirmId=id}}/>;}
      function Interview({definition,pricing,value}){const resolved=interviewDefinition(definition,pricing);return <section><p className="interview-copy">{resolved.label}</p><StructuredPricingQuestion definition={resolved} value={value} onChange={()=>{}}/></section>;}
      const components={roof:Roof,roofTiers:RoofTiers,roofNotice:RoofNotice,interview:Interview,approval:SavedApproval,preview:TestPreview,widget:QuoteResult};
      const root=createRoot(document.getElementById('root'));let key=0;
      window.showAgent3=(kind,props)=>{window.agent3RoofConfirmId=null;flushSync(()=>root.render(React.createElement(components[kind],{...props,key:++key})));};
    `}
  });
  bundle=built.outputFiles[0].text;
  const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
  browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});
});

after(async()=>{await browser?.close();});

async function rendered(run,{approvalBook,approvalStatus}={}){
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!=='http://qe-agent3.test')throw Error('Unexpected browser request '+url.href);
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>'+bundle.replaceAll('</script','<\\/script')+'</script>'});
    if(url.pathname==='/api/pricebook/agent3-owner'&&request.method()==='GET'&&approvalBook)return route.fulfill({json:approvalBook});
    if(url.pathname==='/api/pricebook/validate'&&request.method()==='POST'&&approvalStatus)return route.fulfill({json:{statuses:[approvalStatus],validationErrors:[]}});
    throw Error('Unexpected endpoint '+request.method()+' '+url.pathname);
  });
  try{
    await page.goto('http://qe-agent3.test/');
    const show=(kind,props)=>page.evaluate(({kind,props})=>window.showAgent3(kind,props),{kind,props});
    await run(page,show);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
}

function roofDefinition(){
  return applicationMetadata().services.find(service=>service.serviceType==='ROOFING_REPLACEMENT')
    .fields.find(field=>field.field==='materialCostPerSquare');
}

function confirmedRoof(mode='per_square_allin'){
  const service={serviceType:'ROOFING_REPLACEMENT',pricing:{accessoryPricingMode:mode,materialCostPerSquare:{asphalt_shingle:10000,metal:20000}}};
  const definitions=['asphalt_shingle','metal'].map(roofFlashingVentDefinitionVNext),asphalt=definitions[0].id;
  const stored=synchronizeDependentLinesVNext(service,definitions,{ownerId:'agent3-owner',now:NOW,reenteredIds:[asphalt],confirmIds:[asphalt]});
  return {...stored,pricing:{...stored.pricing,materialCostPerSquare:{asphalt_shingle:100,metal:200}}};
}

function tierReceiptRoof(){
  const f=accessoryRoof({
    materialCostPerSquare:{asphalt_shingle:10000},
    wasteFactorByComplexity:{simple:0,moderate:0,complex:0},
    valleyPerLF:1000
  });
  f.ownerPricing.tiers=[
    {name:'Inherited',overrides:{}},
    {name:'Same price',overrides:{materialCostPerSquare:{asphalt_shingle:10000}}},
    {name:'Premium',overrides:{materialCostPerSquare:{asphalt_shingle:40000}}}
  ];
  const definitions=roofDependentDefinitionsVNext(f.ownerPricing);
  const id=name=>definitions.find(definition=>definition.tierName===name)?.id;
  const ids={base:definitions.find(definition=>definition.tierName===undefined).id,same:id('Same price'),premium:id('Premium')};
  f.ownerPricing=synchronizeDependentLinesVNext(f.ownerPricing,definitions,{
    ownerId:f.ownerPricing.origin.ownerId,now:NOW,
    reenteredIds:[ids.base,ids.same,ids.premium],confirmIds:[ids.base,ids.premium]
  });
  f.customerInputs.valleyLengthLF=20;
  return {f,definitions,ids};
}

function roofForClient(service){
  const next=structuredClone(service);
  next.pricing.materialCostPerSquare=Object.fromEntries(Object.entries(next.pricing.materialCostPerSquare||{}).map(([key,value])=>[key,value/100]));
  next.tiers=(next.tiers||[]).map(tier=>({
    ...tier,
    overrides:{...tier.overrides,...(tier.overrides?.materialCostPerSquare?{materialCostPerSquare:Object.fromEntries(Object.entries(tier.overrides.materialCostPerSquare).map(([key,value])=>[key,value/100]))}:{})}
  }));
  return next;
}

function surfaceTierFixture(){
  const f=fixture('INTERIOR_PAINTING',{
    laborPerWallSqftPerCoat:100,materialPerWallSqftPerCoat:30,minimumJob:0
  },{
    areaInputMethod:'wall_sqft',wallAreaSqft:400,wallHeight:'standard',wallScopeUniform:true,
    surfaceCondition:'good',coats:2,ceilingsIncluded:false,trimIncluded:false,
    surfaceOptionalItems:['doorSides'],paintDoorSides:2
  });
  f.ownerPricing.priceBasisByCategory.material='sell_price';
  f.ownerPricing.tiers=[
    {name:'Base',overrides:{}},
    {name:'Complete',overrides:{surfaceExtraRates:{doorSides:5000}}}
  ];
  return f;
}

function mowingQuote({frequency='weekly',condition='severe',tiers=true}={}){
  const f=mowingFixture();
  f.ownerPricing.pricing.mowingBaseRatePerSqft=0.1;
  f.customerInputs.serviceFrequency=frequency;
  f.customerInputs.grassCondition=condition;
  f.businessDefaults.rangeBufferPercent=10;
  f.ownerPricing.tiers=tiers?[{name:'Base',overrides:{}},{name:'Complete',overrides:{mowingBaseRatePerSqft:0.2}}]:[];
  const quote=sanitizeForCustomerVNext(generateQuoteVNext(f));
  assert.equal(quote.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(quote));
  return quote;
}

test('Agent3 F6: the actual saved-approval table omits starting-value adoption receipts',async()=>{
  const receiptMarker='INTERNAL_ADOPTION_RECEIPT_MUST_NOT_RENDER';
  const service={
    id:'00000000-0000-4000-8000-0000000000a3',serviceType:'CUSTOM',service:'[SYNTHETIC] Approval row',
    source:'MANUAL',active:false,pricing:{customPricingMode:'fixed',price:100},tiers:[],
    startingValueAdoptions:{[receiptMarker]:{mode:'legacy',introducedAt:NOW}}
  };
  const defaults={currency:'CAD',markupMode:'markup',markupPercent:0,rangeBufferPercent:0};
  const meta={fields:[{field:'price',label:'Price',money:true}],class2Fields:[]};
  const rows=reviewRows(service,defaults,meta);
  assert.equal(JSON.stringify(rows).includes(receiptMarker),false);
  assert.equal(rows.some(row=>/starting value adoption/i.test(row.label)),false);

  const book={revision:'agent3-approval-revision',services:[service],defaults};
  const status={serviceId:service.id,status:'NEEDS PRICING',legacySettings:[],confirmationFields:[]};
  await rendered(async(page,show)=>{
    await show('approval',{meta,ownerId:'agent3-owner',serviceId:service.id,draft:book});
    await page.getByRole('button',{name:'Review saved configuration',exact:true}).click();
    await page.getByRole('table',{name:'Saved prices and configuration'}).waitFor();
    const text=await page.getByRole('table',{name:'Saved prices and configuration'}).textContent();
    assert.ok(text.includes('$100'));
    assert.equal(text.includes(receiptMarker),false);
    assert.doesNotMatch(text,/starting value adoption/i);
  },{approvalBook:book,approvalStatus:status});
});

test('Agent3 F14: rendered roof copy follows base, inherited and independent tier receipts',async()=>{
  const definition=roofDefinition(),service=confirmedRoof();
  assert.equal(service.pricing.materialCostPerSquare.asphalt_shingle,100);
  assert.equal(service.dependentLineState['roofing_flashing_vents.asphalt_shingle'].baseValue,10000);
  const mixed=roofMaterialPresentationCopy(definition,service,service.pricing,{pricesInDollars:true});
  assert.match(mixed.label,/basis differs by roofing product/i);
  assert.match(mixed.tree.leafHelp.asphalt_shingle,/INCLUDING starter, drip edge, and ridge cap/i);
  assert.match(mixed.tree.leafHelp.asphalt_shingle,/EXCLUDING separately priced ice and water barrier/i);
  assert.doesNotMatch(mixed.tree.leafHelp.asphalt_shingle,/INCLUDING.*flashing.*vents/i);
  assert.match(mixed.tree.leafHelp.metal,/INCLUDING starter, drip edge, ridge cap, flashing, and vents/i);

  const allInUnconfirmed=roofMaterialPresentationCopy(definition,{pricing:service.pricing},service.pricing,{pricesInDollars:true});
  assert.match(allInUnconfirmed.label,/INCLUDING starter, drip edge, ridge cap, flashing, and vents/i);
  const itemizedService={...service,pricing:{...service.pricing,accessoryPricingMode:'itemized'}};
  const itemized=roofMaterialPresentationCopy(definition,itemizedService,itemizedService.pricing,{pricesInDollars:true});
  assert.match(itemized.tree.leafHelp.asphalt_shingle,/EXCLUDING starter, drip edge, ridge cap, ice and water barrier/i);
  assert.match(itemized.tree.leafHelp.metal,/EXCLUDING separately itemized starter, drip edge, and ridge cap, and INCLUDING flashing and vents/i);

  const {f,definitions,ids}=tierReceiptRoof(),receiptSnapshot=JSON.stringify(f.ownerPricing.dependentLineState);
  assert.equal(f.ownerPricing.pricing.materialCostPerSquare.asphalt_shingle,10000);
  assert.equal(f.ownerPricing.tiers[1].overrides.materialCostPerSquare.asphalt_shingle,10000);
  assert.equal(f.ownerPricing.tiers[2].overrides.materialCostPerSquare.asphalt_shingle,40000);
  const pendingQuote=generateQuoteVNext(f);
  assert.equal(pendingQuote.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(pendingQuote));
  assert.deepEqual(pendingQuote.options.map(option=>[option.tierName,option.midEstimate]),[['Inherited',581],['Premium',881]]);

  const client=roofForClient(f.ownerPricing),copyFor=(candidate,tierName)=>{
    const tier=candidate.tiers.find(option=>option.name===tierName),pricing=mergePricingVNext(candidate.pricing,tier?.overrides||{});
    return roofMaterialPresentationCopy(definition,candidate,pricing,{pricesInDollars:true,tierName,leafHelp:true});
  };
  assert.match(copyFor(client,'Inherited').label,/EXCLUDING separately priced ice and water barrier/i);
  assert.match(copyFor(client,'Same price').label,/INCLUDING starter, drip edge, ridge cap, flashing, and vents/i);
  assert.match(copyFor(client,'Premium').label,/EXCLUDING separately priced ice and water barrier/i);
  assert.equal(JSON.stringify(f.ownerPricing.dependentLineState),receiptSnapshot);

  const confirmedSame=synchronizeDependentLinesVNext(f.ownerPricing,definitions,{ownerId:f.ownerPricing.origin.ownerId,now:'2026-10-18T12:01:00.000Z',confirmIds:[ids.same]});
  const confirmedFixture={...f,ownerPricing:confirmedSame},confirmedQuote=generateQuoteVNext(confirmedFixture);
  assert.equal(confirmedQuote.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(confirmedQuote));
  assert.deepEqual(confirmedQuote.options.map(option=>[option.tierName,option.midEstimate]),[['Inherited',581],['Same price',581],['Premium',881]]);
  const confirmedClient=roofForClient(confirmedSame);
  assert.match(copyFor(confirmedClient,'Same price').label,/EXCLUDING separately priced ice and water barrier/i);
  assert.match(copyFor(confirmedClient,'Premium').label,/EXCLUDING separately priced ice and water barrier/i);

  for(const [mode,pattern] of [
    ['per_square_allin',/INCLUDING starter, drip edge, ridge cap, flashing, and vents/i],
    ['itemized',/EXCLUDING separately itemized starter, drip edge, and ridge cap, and INCLUDING flashing and vents/i]
  ])assert.match(interviewDefinition(definition,{accessoryPricingMode:mode,materialCostPerSquare:{asphalt_shingle:100}}).label,pattern);

  await rendered(async(page,show)=>{
    await show('roof',{definition,service});
    await page.getByText(/inclusion basis differs by roofing product/i).waitFor();
    const asphalt=page.locator('.field').filter({has:page.locator('.field-label',{hasText:'Asphalt shingle'})}).first();
    const metal=page.locator('.field').filter({has:page.locator('.field-label',{hasText:'Metal'})}).first();
    assert.match(await asphalt.locator('.field-help').textContent(),/INCLUDING starter.*EXCLUDING separately priced ice/i);
    assert.match(await metal.locator('.field-help').textContent(),/INCLUDING starter.*flashing, and vents/i);

    const itemizedAsphalt={...itemizedService,pricing:{...itemizedService.pricing,materialCostPerSquare:{asphalt_shingle:100}}};
    await show('roof',{definition,service:itemizedAsphalt});
    assert.match(await page.locator('.owner-field-definition').textContent(),/EXCLUDING starter, drip edge, ridge cap, ice and water barrier.*ridge vent/i);
    assert.doesNotMatch(await page.locator('.owner-field-definition').textContent(),/INCLUDING flashing and vents/i);

    await show('roofTiers',{definition,service:client});
    const tierRows=page.locator('.tier-row');
    assert.match(await tierRows.nth(1).locator('.field-help').textContent(),/INCLUDING starter, drip edge, ridge cap, flashing, and vents/i);
    assert.doesNotMatch(await tierRows.nth(1).locator('.field-help').textContent(),/EXCLUDING.*ice and water barrier/i);
    assert.match(await tierRows.nth(2).locator('.field-help').textContent(),/EXCLUDING separately priced ice and water barrier/i);
    assert.doesNotMatch(await tierRows.nth(2).locator('.field-help').textContent(),/INCLUDING.*flashing.*vents/i);

    await show('roof',{definition,service:client,tierName:'Inherited',compact:true});
    assert.match(await page.locator('.field-help').textContent(),/EXCLUDING separately priced ice and water barrier/i);

    await show('roofTiers',{definition,service:confirmedClient});
    const confirmedRows=page.locator('.tier-row');
    assert.match(await confirmedRows.nth(1).locator('.field-help').textContent(),/EXCLUDING separately priced ice and water barrier/i);
    assert.match(await confirmedRows.nth(2).locator('.field-help').textContent(),/EXCLUDING separately priced ice and water barrier/i);

    const pendingNotice=structuredClone(client);
    pendingNotice.dependentLineState[ids.base].confirmed=false;
    pendingNotice.dependentLineActions={confirmIds:[ids.base,ids.same]};
    await show('roofNotice',{service:pendingNotice});
    await page.getByRole('button',{name:'CONFIRM ON SAVE — Asphalt shingle — Base price',exact:true}).waitFor();
    await page.getByRole('button',{name:'CONFIRM ON SAVE — Asphalt shingle — Same price',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:/CONFIRM ON SAVE — Asphalt shingle —/}).count(),2);

    const actionableNotice=structuredClone(client);
    actionableNotice.dependentLineActions={confirmIds:[]};
    await show('roofNotice',{service:actionableNotice});
    await page.getByRole('button',{name:'I re-entered and confirm Asphalt shingle — Same price',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.agent3RoofConfirmId),ids.same);

    await show('interview',{definition,pricing:{accessoryPricingMode:'itemized',materialCostPerSquare:{asphalt_shingle:100}},value:{asphalt_shingle:100}});
    assert.match(await page.locator('.interview-copy').textContent(),/EXCLUDING separately itemized starter.*INCLUDING flashing and vents/i);
    assert.equal(await page.locator('.field-help').count(),0);
    await show('interview',{definition,pricing:{accessoryPricingMode:'per_square_allin',materialCostPerSquare:{asphalt_shingle:100}},value:{asphalt_shingle:100}});
    assert.match(await page.locator('.interview-copy').textContent(),/INCLUDING starter, drip edge, ridge cap, flashing, and vents/i);
  });
});

test('Agent3 F18: option exclusions stay per option through saved retry, widget, and voice',async()=>{
  const saved=webQuote(surfaceTierFixture());
  assert.equal(saved.result.resultType,'INSTANT_ESTIMATE_READY');
  assert.deepEqual(saved.result.options.map(option=>[option.tierName,option.midEstimate,option.skippedAddons]),[
    ['Base',1064,['Door sides']],['Complete',1164,[]]
  ]);
  assert.equal(saved.result.additionalWork,undefined);
  assert.equal(saved.result.fullJobTotal,null);

  const {pricedScope,submittedDetails,scopeNotice,fullJobTotal,...pricedEstimate}=saved.result;
  const historical={
    resultType:'PARTIAL_ESTIMATE_READY',quoteId:saved.result.quoteId,pricedEstimate,
    pricedScope,submittedDetails,scopeNotice,fullJobTotal,
    additionalWork:[{source:'unpriced_surface_work',description:'Door sides'}],
    additionalWorkStatus:'ON_SITE_ESTIMATE_REQUIRED',
    customerMessage:'[HISTORICAL] false whole-quote exclusion'
  };
  const historicalCopy=structuredClone(historical),storedJson=JSON.stringify(historical);
  db.prepare("UPDATE quoteSubmissions SET resultType='PARTIAL_ESTIMATE_READY',customerResponseJson=? WHERE ownerId=? AND requestId=?")
    .run(storedJson,saved.owner,saved.body.requestId);
  const retry=saved.submit();
  assert.equal(retry.status,200);
  assert.equal(retry.response.resultType,'INSTANT_ESTIMATE_READY');
  assert.deepEqual(retry.response.options.map(option=>[option.tierName,option.midEstimate,option.skippedAddons]),[
    ['Base',1064,['Door sides']],['Complete',1164,[]]
  ]);
  assert.equal(retry.response.additionalWork,undefined);
  assert.equal(retry.response.fullJobTotal,null);
  assert.deepEqual(historical,historicalCopy);
  assert.equal(db.prepare('SELECT customerResponseJson FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(saved.owner,saved.body.requestId).customerResponseJson,storedJson);

  const direct=customerReceiptPresentation(historical);
  assert.deepEqual(direct,retry.response);
  const savedVoice=projectSavedQuoteContext(historical);
  assert.equal(savedVoice.resultType,'INSTANT_ESTIMATE_READY');
  assert.deepEqual(savedVoice.options.map(option=>[option.tierName,option.midEstimate,option.skippedAddons]),[
    ['Base',1064,['Door sides']],['Complete',1164,[]]
  ]);
  assert.equal(savedVoice.additionalWork,undefined);
  assert.equal(savedVoice.fullJobTotal,undefined);
  const replayedVoice=projectVoiceQuote(historical,'agent3-historical-quote');
  assert.equal(replayedVoice.resultType,'INSTANT_ESTIMATE_READY');
  assert.deepEqual(replayedVoice.options.map(option=>[option.tierName,option.midEstimate,option.skippedAddons]),[
    ['Base',1064,['Door sides']],['Complete',1164,[]]
  ]);
  assert.doesNotMatch(replayedVoice.voiceSummary,/separate additional work/i);
  const currentVoice=projectVoiceQuote(saved.result,'[SYNTHETIC] agent3 quote');
  assert.deepEqual(currentVoice.options.map(option=>[option.tierName,option.midEstimate,option.skippedAddons]),[
    ['Base',1064,['Door sides']],['Complete',1164,[]]
  ]);

  const genuine=webQuote(surfaceTierFixture(),['[SYNTHETIC] detached fence repair']);
  assert.equal(genuine.result.resultType,'PARTIAL_ESTIMATE_READY');
  assert.deepEqual(genuine.result.additionalWork,[{source:'additionalWork[0]',description:'[SYNTHETIC] detached fence repair'}]);
  assert.deepEqual(genuine.result.pricedEstimate.options.map(option=>option.tierName),['Base','Complete']);
  assert.equal(genuine.result.fullJobTotal,null);

  await rendered(async(page,show)=>{
    await show('widget',{result:retry.response});
    const base=page.locator('article').filter({has:page.getByRole('heading',{name:'Base',exact:true})});
    const complete=page.locator('article').filter({has:page.getByRole('heading',{name:'Complete',exact:true})});
    assert.equal((await base.locator('strong').first().textContent()).trim(),'$1,064');
    assert.match(await base.textContent(),/Door sides is excluded/i);
    assert.equal((await complete.locator('strong').first().textContent()).trim(),'$1,164');
    assert.doesNotMatch(await complete.textContent(),/Door sides.*excluded/i);
    assert.equal(await page.getByRole('heading',{name:'Additional work for on-site estimate',exact:true}).count(),0);
  });
});

test('Agent3 F19: owner preview renders recurring and first-visit ranges for every option',async()=>{
  const quote=mowingQuote();
  assert.deepEqual(quote.options.map(option=>[
    option.tierName,option.lowEstimate,option.midEstimate,option.highEstimate,
    option.firstVisit.lowEstimate,option.firstVisit.midEstimate,option.firstVisit.highEstimate
  ]),[
    ['Base',9,10,11,18,20,22],['Complete',18,20,22,36,40,44]
  ]);
  assert.equal(JSON.stringify(quote).includes('lineItems'),false);

  await rendered(async(page,show)=>{
    await show('preview',{preview:quote});
    assert.equal((await page.locator('.quote-low').textContent()).trim(),'$9');
    assert.equal((await page.locator('.quote-high').textContent()).trim(),'$11');
    assert.equal((await page.locator('.quote-first-visit-low').textContent()).trim(),'$18');
    assert.equal((await page.locator('.quote-first-visit-high').textContent()).trim(),'$22');
    const labels=await page.locator('.quote-range-label').allTextContents();
    assert.deepEqual(labels,['RECURRING RANGE YOUR CUSTOMER GETS','FIRST-VISIT RANGE YOUR CUSTOMER GETS']);
    assert.deepEqual(await page.locator('.quote-price-unit').allTextContents(),['per visit','for the first visit']);
    assert.deepEqual(await page.locator('.quote-tax-treatment').allTextContents(),['Recurring: No tax added.','First visit: No tax added.']);
    assert.deepEqual(await page.locator('.quote-midpoint-value').allTextContents(),['$10 per visit','$20 for the first visit']);

    await page.getByRole('tab',{name:'Complete',exact:true}).click();
    assert.equal((await page.locator('.quote-low').textContent()).trim(),'$18');
    assert.equal((await page.locator('.quote-high').textContent()).trim(),'$22');
    assert.equal((await page.locator('.quote-first-visit-low').textContent()).trim(),'$36');
    assert.equal((await page.locator('.quote-first-visit-high').textContent()).trim(),'$44');
    assert.deepEqual(await page.locator('.quote-midpoint-value').allTextContents(),['$20 per visit','$40 for the first visit']);

    for(const noFirst of [mowingQuote({condition:'maintained',tiers:false}),mowingQuote({frequency:'one_time',tiers:false})]){
      assert.equal(noFirst.firstVisit,undefined);
      assert.equal(noFirst.options[0].firstVisit,undefined);
      await show('preview',{preview:noFirst});
      assert.equal(await page.locator('.quote-first-visit-range,.quote-first-visit-midpoint-row,.quote-first-visit-disclaimer').count(),0);
      assert.deepEqual(await page.locator('.quote-range-label').allTextContents(),['RANGE YOUR CUSTOMER GETS']);
    }
  });
});
