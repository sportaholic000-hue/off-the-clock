import {writeFileSync} from 'node:fs';
import {offeringFixture} from '../../test/configuredOfferingsFixtures.mjs';
import {porchRoof} from '../../test/audit-f1501ff/fixtures.mjs';

// November 24, 2026 (v48): owner direction to quote by industry standard.
// #8 installed painting uses the painter's own coats; #2 a shingled
// low-slope section of an area-by-pitch roof is priced. Run once; never edited.
const cases=[];
const add=(id,input)=>cases.push({id:'v48-20261124:'+id,input:structuredClone(input)});

for(const [type,coats] of [['INTERIOR_PAINTING',1],['INTERIOR_PAINTING',3],['EXTERIOR_PAINTING',1]]){
  const f=offeringFixture(type,'installed');f.customerInputs.coats=coats;add(type.toLowerCase()+'-installed-customer-coats-'+coats,f);
}
{const f=offeringFixture('INTERIOR_PAINTING','installed');delete f.customerInputs.coats;add('interior_painting-installed-no-coat-answer',f);}
add('roof-porch-shingles-two-layers',porchRoof('shingles',{lowSlopeAssemblyByProduct:{asphalt_shingle:'double_underlayment'}}));
add('roof-porch-shingles-self-adhered',porchRoof('shingles',{lowSlopeAssemblyByProduct:{asphalt_shingle:'self_adhered_underlayment'},selfAdheredUnderlaymentPerSquare:9000}));
add('roof-porch-shingles-self-adhered-unpriced',porchRoof('shingles',{lowSlopeAssemblyByProduct:{asphalt_shingle:'self_adhered_underlayment'}}));
add('roof-porch-flat-roofing',porchRoof('flat_roofing'));
add('roof-porch-not-sure',porchRoof('not_sure'));
add('roof-porch-unanswered',porchRoof(null));

writeFileSync(new URL('./corpus-additions-20261124-v48.json',import.meta.url),JSON.stringify(cases,null,1)+'\n');
console.log(cases.length+' inputs');
