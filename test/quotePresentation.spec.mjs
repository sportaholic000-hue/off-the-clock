import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteDisplayDisclaimer} from '../client/src/quotePresentation.js';
test('quote display states unit and tax once while preserving exclusions',()=>{
 const original='Final pricing is confirmed on site. Price is per visit. Includes applicable tax. This estimate does not include: Lawn edging.';
 assert.equal(quoteDisplayDisclaimer(original,{priceUnit:'per visit',taxTreatment:'Includes applicable tax.'}),'Final pricing is confirmed on site. This estimate does not include: Lawn edging.');
 assert.equal(original,'Final pricing is confirmed on site. Price is per visit. Includes applicable tax. This estimate does not include: Lawn edging.');
});
test('quote display retains labels in prose when no separate labels are displayed',()=>{
 const text='Final pricing is confirmed on site. Price is per visit. No tax added.';
 assert.equal(quoteDisplayDisclaimer(text),text);
 assert.equal(quoteDisplayDisclaimer(undefined),'');
});
test('quote display retains scope descriptions and removes only matching displayed labels',()=>{
 const text='Per-visit scheduling is biweekly. Posts and footings included No tax added.';
 assert.equal(quoteDisplayDisclaimer(text,{taxTreatment:'No tax added.'}),'Per-visit scheduling is biweekly. Posts and footings included');
 assert.equal(quoteDisplayDisclaimer(text,{taxTreatment:'Includes applicable tax.'}),text);
});
test('quote display preserves option-specific exclusions and owner prose',()=>{
 const text='Bring access instructions. This estimate does not include: Lawn edging.';
 assert.equal(quoteDisplayDisclaimer(text,{priceUnit:'per visit',taxTreatment:'No tax added.'}),text);
});
