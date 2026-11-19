import {withClass2Defaults} from '../server/quote-engine-vnext/index.js';
import {confirmedFixtureInputs} from './quoteEngineVNextFixtures.mjs';
import fs from 'node:fs';
import {roof,mowing} from './opusQuoteFixtures.mjs';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {custom,withLaneDAnswers} from '../verification/engine-independent/fixtures.mjs';
import {measuredScopeCases} from './measuredScopeFixtures.mjs';
import {withOwnerDecisions} from './ownerDecisionsFixture.mjs';
const catalog=JSON.parse(fs.readFileSync(new URL('./customerExplanationCatalog.json',import.meta.url),'utf8'));
export function explanationCases(){
 // Fix E1 (20261119): trim coats are asked on the basic painting setup; the catalog
 // painting input predates the question and one coat is what its values assume.
 const answered=e=>e.serviceType==='INTERIOR_PAINTING'&&e.customerInputs.trimIncluded===true&&e.customerInputs.trimCoats===undefined?{...e.customerInputs,trimCoats:1}:e.customerInputs;
 // C10 (Lane C, 2026-11-19): sod ground preparation asks whether there is a lawn to remove; the catalog lawn has one.
 const lawn=e=>{const c=answered(e);return e.serviceType==='LANDSCAPING_SOD'&&c.groundPrepNeeded===true&&c.existingLawnToRemove===undefined?{...c,existingLawnToRemove:true}:c;};
 const rows=catalog.entries.filter(e=>!e.expectedOwnerDecision).map(e=>({id:'catalog-'+e.serviceType,input:{serviceType:e.serviceType,customerInputs:confirmedFixtureInputs(lawn(e)),ownerPricing:{...e.ownerPricing,pricing:withClass2Defaults(e.serviceType,withOwnerDecisions(e.serviceType,e.ownerPricing.pricing))},businessDefaults:catalog.defaults,callerType:'owner',currentMonth:1}}));
 // Fix B2 (Lane B, November 19, 2026): the catalog roof prices 2 decking sheets as material only,
 // which now needs its installation labor price (25.00 per sheet here).
 for(const row of rows)if(row.id==='catalog-ROOFING_REPLACEMENT'&&row.input.ownerPricing.pricing.deckingLaborPerSheet===undefined)row.input.ownerPricing.pricing.deckingLaborPerSheet=2500;
 // Lane D fixes D1 and D3 (November 19, 2026): the catalog flooring jobs answer what the
 // floor is built on and the carpet room sizes (withLaneDAnswers); their values stand.
 for(const row of rows)if(row.id.startsWith('catalog-FLOORING_'))row.input=withLaneDAnswers(row.input);
 rows.push({id:'custom-fixed',input:custom()});
 for(const type of ['FENCING_INSTALL','FENCING_REPLACEMENT','INTERIOR_PAINTING','EXTERIOR_PAINTING'])for(const mode of ['installed','itemized'])rows.push({id:type+'-'+mode,input:offeringFixture(type,mode)});
 for(const sheets of [undefined,0,2]){const input=roof(sheets);input.customerInputs.existingLayers=2;rows.push({id:'roof-decking-'+String(sheets),input});}
 for(const frequency of ['weekly','biweekly','monthly','one_time'])rows.push({id:'mowing-'+frequency,input:mowing(frequency)});
 rows.push(...measuredScopeCases().map(c=>({id:'scope-'+c.id,input:c.input})));
 for(const mode of ['installed','itemized']){const input=offeringFixture('FENCING_REPLACEMENT',mode);input.ownerPricing.pricing.offeringDetails.removalIncludesDisposal=false;rows.push({id:'fence-disposal-separate-'+mode,input});}
 const tiered=mowing();Object.assign(tiered.customerInputs,{bagClippings:true,edgingIncluded:true,edgingLengthLF:100});
 tiered.ownerPricing.tiers=[{name:'Good',overrides:{}},{name:'Better',overrides:{baggingSurchargePercent:10}},{name:'Best',overrides:{baggingSurchargePercent:10,edgingPerLinearFoot:50}}];
 rows.push({id:'mowing-divergent-tier-exclusions',input:tiered});
 return structuredClone(rows);
}
export const customerText=o=>[...(o.priceDrivers||[]),o.disclaimer].filter(Boolean).join('\n');
export const customerSentences=o=>customerText(o).split(/(?<=[.!?])\s+|\n/).map(s=>s.trim()).filter(Boolean);
export const duplicateLines=o=>{const seen=new Set(),duplicates=[];for(const line of customerSentences(o)){const key=line.toLowerCase().replace(/\s+/g,' ').replace(/[.!?]+$/,'');if(seen.has(key))duplicates.push(line);seen.add(key);}return duplicates;};
export const internalCopy=/\b(?:owner-defined (?:installed|itemized) offering|reviewed customer charge|configured fee selection|rateCents|ratePath|markup|margin|overhead)\b/i;

export function duplicateFacts(o,input){
 const drivers=o.priceDrivers||[],type=input.serviceType,c=input.customerInputs,out=[];
 const groups=[];
 if(type==='ROOFING_REPLACEMENT')groups.push(['existing roof layers',/^\d+ (?:measured )?existing (?:roof )?layers?$/],['included decking',/^(?:Confirmed decking replacement is included|\d+ decking sheets? included)/]);
 if(type==='FLAT_ROOF_REPLACEMENT')groups.push(['existing membrane layers',/^\d+ existing (?:membrane )?layers?$/]);
 if(type==='INTERIOR_PAINTING'&&!input.ownerPricing.pricing.offeringMode)groups.push(['wall coats',/^\d+ (?:paint )?coats?$/]);
 if(type==='EXTERIOR_PAINTING'&&!input.ownerPricing.pricing.offeringMode)groups.push(['wall finish coats',/\b\d+ finish(?: material)? coats?\b/],['wall area',/^\d+(?:\.\d+)? measured square feet/]);
 if(type==='LANDSCAPING_CLEANUP')groups.push(['cleanup area',/^\d+(?:\.\d+)? measured square feet/],['debris level',/\b(?:light|moderate|heavy) debris(?: level)?$/]);
 if(type==='LANDSCAPING_MULCH')groups.push(['mulch volume',/^\d+(?:\.\d+)? calculated cubic yards of/],['edging length',/^\d+(?:\.\d+)? measured linear feet of (?:bed )?edging$/]);
 if(type==='LANDSCAPING_SOD')groups.push(['sod area',/^\d+(?:\.\d+)? measured square feet(?: of sod)?$/]);
 for(const [label,pattern] of groups)if(drivers.filter(s=>pattern.test(s)).length>1)out.push(label);
 return out;
}
