import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {voiceQuestionContract} from '../server/src/voice/voiceQuoteContract.js';

// Owner ruling 2026-10-15: only gate offering choices may exceed 240
// characters. These expected labels preserve the contract at 019ddba0.
const key='synthetic_choice';
const labelOf=field=>voiceQuestionContract({knownOfferings:{[field.name]:{[key]:'synthetic-offering'}}},
  {customerFields:[{label:'[SYNTHETIC] Choice',values:[key],...field}]}).fields[0].choices[0];
const label=length=>'[SYNTHETIC] '+ 'A'.repeat(length-12);
const fields=[
  {name:'terrainSlope',type:'enum'},
  {name:'fenceType',type:'slug'},
  {name:'plants',type:'plant_counts'},
  {name:'otherOfferings',type:'offering_counts'},
  // A name alone must not grant the gate offering exception.
  {name:'gates',type:'enum'},
];

for(const field of fields)for(const source of ['options','optionLabels'])for(const length of [239,240,241]){
  test(`QE-015 non-gate ${field.name}/${field.type} ${source} ${length}-character label matches 019ddba0`,()=>{
    const value=label(length);
    assert.equal(value.length,length);
    assert.deepEqual(labelOf({...field,[source]:{[key]:value}}),{
      value:key,label:length<=240?value:'synthetic choice',
    });
  });
}

for(const [name,options,optionLabels,expected] of [
  ['long primary uses short secondary',label(241),'[SYNTHETIC] Secondary','[SYNTHETIC] Secondary'],
  ['empty primary uses secondary','','[SYNTHETIC] Secondary','[SYNTHETIC] Secondary'],
  ['blank primary uses secondary','   ','[SYNTHETIC] Secondary','[SYNTHETIC] Secondary'],
  ['non-string primary uses secondary',42,'[SYNTHETIC] Secondary','[SYNTHETIC] Secondary'],
  ['null primary uses secondary',null,'[SYNTHETIC] Secondary','[SYNTHETIC] Secondary'],
  ['invalid secondary uses key',undefined,false,'synthetic choice'],
  ['both labels over cap use key',label(241),label(4001),'synthetic choice'],
  ['valid primary wins and trims','  [SYNTHETIC] Primary  ','[SYNTHETIC] Secondary','[SYNTHETIC] Primary'],
  ['cap applies before trimming',' '+label(240)+' ',undefined,'synthetic choice'],
])test(`QE-015 non-gate historical fallback: ${name}`,()=>{
  assert.deepEqual(labelOf({name:'terrainSlope',type:'enum',options:{[key]:options},optionLabels:{[key]:optionLabels}}),{value:key,label:expected});
});
