import {auditFixtures} from '../qe-agent3-widget-dependencies-20261019/audit-fixtures.mjs';

export const A3_COVERED=['CONCRETE_DRIVEWAY','FENCING_INSTALL','FLAT_ROOF_REPAIR','FLOORING_REPLACEMENT','LANDSCAPING_MOWING','LANDSCAPING_MULCH','LANDSCAPING_PLANTING','ROOFING_REPAIR'];
// Hand-calculated constants are documented in EXPECTED.md before comparisons.
export const CASES=[
 // November 19, 2026 (v37, Lane B fix B2): the catalog roof's 2 material-only decking sheets
 // now carry their installation labor, 2 x 25.00 = 50.00: 244600 + 5000 and 244698 + 5000.
 ['ROOFING_REPLACEMENT',249600,'roofSizeInput',1000.5,249698,'laborPerSquare.asphalt_shingle'],
 ['FLAT_ROOF_REPLACEMENT',1805000,'roofSqft',1000.5,1805903,'laborPerSqft.epdm'],
 ['INTERIOR_PAINTING',300000,'wallAreaSqft',500.5,300300,'offeringRates.installedWallPerSqft'],
 ['EXTERIOR_PAINTING',318000,'exteriorAreaSqft',500.5,318318,'offeringRates.installedWallPerSqft'],
 ['FLOORING_INSTALL',260670,'sqft',300.5,260940,'laborPerSqft.vinyl_plank'],
 ['FENCING_REPLACEMENT',490000,'linearFeet',100.5,492000,'offeringRates.installedFencePerLF'],
 ['SIDING_REPLACEMENT',1170000,'sidingAreaSqft',1000.5,1170585,'laborPerSqft.vinyl'],
 ['SIDING_REPAIR',54000,'affectedArea',50.25,54000,'laborHourlyRate'],
 ['CONCRETE_PATIO_SLAB',353889,'length',20.5,361486,'laborPerSqft'],
 ['LANDSCAPING_CLEANUP',40000,'haulAway',false,35000,'cleanupBaseRatePerSqft'],
 ['LANDSCAPING_SOD',253750,'groundPrepNeeded',false,203750,'sodInstallLaborPerSqft'],
 ['CUSTOM',12500,'serviceConfirmed',true,12500,'price']
].map(([type,cents,field,value,correctedCents,pricePath])=>({type,cents,field,value,correctedCents,pricePath}));
export function fixtures(){return auditFixtures();}
// C10 (November 19, 2026): the sod lawn answer belongs to ground preparation, so
// turning ground preparation off leaves it out of the corrected scope.
export function corrected(row,base){const c={...structuredClone(base),[row.field]:row.value};if(row.type==='LANDSCAPING_SOD'&&row.field==='groundPrepNeeded'&&row.value===false)delete c.existingLawnToRemove;return c;}
export function invalid(row,base){
 const c=structuredClone(base);
 if(row.type==='CUSTOM')c.serviceConfirmed=false;
 else if(row.type==='LANDSCAPING_CLEANUP')c.yardSqft=0;
 else if(row.type==='LANDSCAPING_SOD')c.sodSqft=0;
 else c[row.field]=0;
 return c;
}
