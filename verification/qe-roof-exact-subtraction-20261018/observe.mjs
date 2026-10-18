import {readFileSync,writeFileSync} from 'node:fs';
import {generateQuoteVNext,ENGINE_VERSION} from '../../server/quote-engine-vnext/index.js';
import {input} from './fixture.mjs';
const label=process.argv[2];if(!['v9','v10'].includes(label))throw Error('explicit version required');
const rows=JSON.parse(readFileSync(new URL('./expected-cases.json',import.meta.url))).map(r=>{const q=generateQuoteVNext(input(r));return {id:r.id,expectedCents:r.expectedCents,actualCents:q.options?.[0].calculationRecord.scenarios.mid.finalTotalCents,resultType:q.resultType,lines:q.lineItems};});
writeFileSync(new URL('./observed-'+label+'.json',import.meta.url),JSON.stringify({engineVersion:ENGINE_VERSION,rows},null,2)+'\n');
console.log(JSON.stringify(rows.map(({id,expectedCents,actualCents,resultType})=>({id,expectedCents,actualCents,resultType})),null,2));
