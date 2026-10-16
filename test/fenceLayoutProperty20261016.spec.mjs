import test from 'node:test';
import assert from 'node:assert/strict';
import {fencePostQuantities} from '../server/quote-engine-vnext/fencePricing.js';

// Independent position oracle: quarter-foot integer coordinates, unique fixed
// positions, and line posts stepped from one fixed post toward the next.
// No ceil(), division-based count, or engine layout derivation is used here.
function placed(runs,gates,spacingUnits){
  let fixedTotal=0,lineTotal=0,includedTotal=0;
  for(const run of runs){
    const fixed=new Set([0]),lines=new Set();let position=0,included=0;
    for(const section of run.sections){
      const end=position+Math.round(section.lengthLF*4);
      for(let next=position+spacingUnits;next<end;next+=spacingUnits)lines.add(next);
      fixed.add(end);position=end;
      if(section.gateAfter){
        const gate=gates[section.gateAfter];position+=Math.round(gate.widthLF*4);fixed.add(position);
        if(gate.postsAndFootingsIncluded)included+=2;
      }
    }
    if(run.closed){fixed.delete(position);fixed.add(0);}
    fixedTotal+=fixed.size;lineTotal+=lines.size;includedTotal+=included;
  }
  return {total:fixedTotal+lineTotal-includedTotal,terminal:fixedTotal-includedTotal,line:lineTotal};
}
test('Oct16 property: 20,000 seeded layouts equal independently placed posts; fallback is never below placed posts',t=>{
  const seed=0x16f3ace1;let state=seed,closed=0,withGates=0,maxFallbackExtra=0;
  const int=n=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)%n;};
  for(let sample=0;sample<20000;sample++){
    const spacingUnits=16+int(25),runCount=1+int(3),runs=[],gates={};let totalUnits=0,corners=0;
    for(let r=0;r<runCount;r++){
      const loop=int(2)===1,sides=1+int(5),sections=[];
      if(loop)closed++;corners+=loop?sides:sides-1;
      for(let side=0;side<sides;side++){
        const gateCount=int(3);
        for(let part=0;part<=gateCount;part++){
          const units=1+int(160),section={lengthLF:units/4};totalUnits+=units;
          if(part<gateCount){const key='gate_'+Object.keys(gates).length;gates[key]={widthLF:(12+int(37))/4,description:'[SYNTHETIC] measured gate',postsAndFootingsIncluded:int(2)===1};section.gateAfter=key;}
          sections.push(section);
        }
      }
      // A rotation also exercises gate boundaries at a closed run's seam.
      if(loop){const cut=int(sections.length);sections.push(...sections.splice(0,cut));}
      runs.push({closed:loop,sections});
    }
    if(Object.keys(gates).length)withGates++;
    // Expected counts are placed by position BEFORE calling the engine.
    const expected=placed(runs,gates,spacingUnits);
    const p={postSpacingLF:spacingUnits/4,offeringDetails:{gates}};
    const actual=fencePostQuantities({fenceRunCount:runCount,fenceRuns:runs},p);
    assert.deepEqual({total:actual.total,terminal:actual.terminal,line:actual.line},expected,'seed '+seed+', sample '+sample);
    const fallback=fencePostQuantities({linearFeet:totalUnits/4,fenceRunCount:runCount,cornerCount:corners,gates:Object.fromEntries(Object.keys(gates).map(k=>[k,1]))},p);
    assert.ok(fallback.total>=expected.total,'fallback under-count at seed '+seed+', sample '+sample);
    assert.ok(fallback.terminal>=expected.terminal,'fallback terminal under-count at seed '+seed+', sample '+sample);
    assert.ok(fallback.line>=expected.line,'fallback line under-count at seed '+seed+', sample '+sample);
    maxFallbackExtra=Math.max(maxFallbackExtra,fallback.total-expected.total);
  }
  t.diagnostic(JSON.stringify({seed,layouts:20000,closedRuns:closed,layoutsWithGates:withGates,maxFallbackExtra}));
});
