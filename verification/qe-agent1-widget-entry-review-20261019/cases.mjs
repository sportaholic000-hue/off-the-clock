import {auditFixtures} from '../qe-agent3-widget-dependencies-20261019/audit-fixtures.mjs';
export const CASES=[
 ['ROOFING_REPLACEMENT',244600,'roofSizeInput'],['ROOFING_REPAIR',58600,'affectedArea'],
 ['FLAT_ROOF_REPLACEMENT',1805000,'roofSqft'],['FLAT_ROOF_REPAIR',36000,'affectedArea'],
 ['INTERIOR_PAINTING',300000,'wallAreaSqft'],['EXTERIOR_PAINTING',318000,'exteriorAreaSqft'],
 ['FLOORING_INSTALL',260670,'sqft'],['FLOORING_REPLACEMENT',311280,'sqft'],
 ['FENCING_INSTALL',450000,'fenceHeight'],['FENCING_REPLACEMENT',490000,'fenceHeight'],
 ['SIDING_REPLACEMENT',1170000,'sidingAreaSqft'],['SIDING_REPAIR',54000,'affectedArea'],
 ['CONCRETE_DRIVEWAY',892222,'length'],['CONCRETE_PATIO_SLAB',353889,'length'],
 ['LANDSCAPING_CLEANUP',40000,'yardSqft'],['LANDSCAPING_MULCH',32275,'mulchArea'],
 ['LANDSCAPING_SOD',253750,'sodSqft'],['LANDSCAPING_PLANTING',28500,'plantsBySize'],
 ['LANDSCAPING_MOWING',16000,'yardSqft'],['CUSTOM',12500,'serviceConfirmed']
].map(([type,cents,required])=>({type,cents,required}));
export const VIEWPORTS=[{name:'desktop',width:1440,height:1000,mobile:false},{name:'mobile',width:390,height:844,mobile:true}];
export const fixtures=auditFixtures;
export const ADDITIONAL='[SYNTHETIC] Separate garden assessment requested for an on-site estimate.';
// Independent customer quantity/unit checks, not generated from a quote result.
export const QUANTITY_TEXT={
 ROOFING_REPLACEMENT:/1,?000 square feet/,ROOFING_REPAIR:/100 square feet/,
 FLAT_ROOF_REPLACEMENT:/1,?000 square feet/,FLAT_ROOF_REPAIR:/10 square feet/,
 INTERIOR_PAINTING:/500 square feet/,EXTERIOR_PAINTING:/500 square feet/,
 FLOORING_INSTALL:/300 square feet/,FLOORING_REPLACEMENT:/300 square feet/,
 FENCING_INSTALL:/100 linear feet/,FENCING_REPLACEMENT:/100 linear feet/,
 SIDING_REPLACEMENT:/1,?000 square feet/,SIDING_REPAIR:/50 square feet/,
 CONCRETE_DRIVEWAY:/50 feet/,CONCRETE_PATIO_SLAB:/20 feet/,
 LANDSCAPING_CLEANUP:/1,?000 square feet/,LANDSCAPING_MULCH:/270 square feet/,
 LANDSCAPING_SOD:/1,?000 square feet/,LANDSCAPING_PLANTING:/2 cubic yards/,
 LANDSCAPING_MOWING:/5,?000 square feet/,CUSTOM:/Flat/
};
