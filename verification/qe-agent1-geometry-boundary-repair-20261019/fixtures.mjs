import {build as auditBuild} from '../qe-agent1-arithmetic-boundaries-20261019/fixtures.mjs';
export function build(row){
 if(!row.kind)return auditBuild(row);
 const a=row.params;
 if(row.kind==='roof'){
  const f=auditBuild({family:a.coverage?'roof-package':'roof-footprint',params:{footprint:a.footprint,rise:a.rise,coverage:a.coverage}}),p=f.ownerPricing.pricing,c=f.customerInputs;
  c.pitchBand=a.rise<=6?'up_to_six':a.rise<=9?'seven_to_nine':a.rise<=12?'ten_to_twelve':'over_twelve';
  Object.assign(p,{pitchInstallationAdder:{seven_to_nine:.25,ten_to_twelve:.25},pitchRemovalAdder:{seven_to_nine:.5,ten_to_twelve:.5},pitchInstallationAdderOverTwelve:.25,pitchRemovalAdderOverTwelve:.5,wasteFactorByComplexity:{simple:a.waste,moderate:a.waste,complex:a.waste}});
  if(a.coverage)p.scopeDetails.roof_underlayment_asphalt_shingle.wastePercent=a.waste*100;
  if(a.bundles)p.bundlesPerSquare={asphalt_shingle:a.bundles};
  if(a.pct!==100){c.serviceScope='partial';c.partialPercent=a.pct;}
  if(a.both)c.partialAreaSqft=row.expected.area;
  return f;
 }
 const rectangle=a.length!==null;
 const f=auditBuild({family:rectangle?'concrete-joint':'concrete-square-joint',params:{type:a.type,length:a.length,area:a.area}});
 Object.assign(f.ownerPricing.pricing,{controlJointSpacingFt:a.spacing});f.customerInputs.thickness=a.thickness;
 if(rectangle)f.customerInputs.width=a.width;
 return f;
}
