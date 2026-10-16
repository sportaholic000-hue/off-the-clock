import { formatFenceHeight } from '../quote-engine-vnext/configuredOfferings.js';
// Presentation only: original measurements and the signed submission are unchanged.
const measurement = {exact:'Measured area',assumption:'Estimated area',roof_measured:'Measured roof area',home_floor_area:'Home floor area'};
const grass = {maintained:'Regularly maintained',overgrown:'Overgrown',severe:'Severely overgrown'};
export function customerSummaryValue(field, value, fallback) {
  if(field?.name==='fenceRunCount'&&typeof value==='number')return value+' fence '+(value===1?'run':'runs');
  if(field?.type==='number_or_unknown'&&value==='unknown')return 'Not sure';
  if(field?.type==='fence_runs'&&Array.isArray(value))return value.map((run,i)=>{
    if(!run||!Array.isArray(run.sections))return 'Run '+(i+1)+': Not supplied';
    const lengths=run.sections.map(section=>section&&typeof section==='object'&&!Array.isArray(section)?fallback(section.lengthLF)+' ft':'Not supplied');
    const joined=lengths.length<2?lengths[0]:lengths.slice(0,-1).join(', ')+' and '+lengths.at(-1);
    const gates=run.sections.flatMap((section,j)=>{
      if(!section||!section.gateAfter)return [];
      const gate=field.gateChoices?.find(g=>g.value===section.gateAfter)?.label||(typeof section.gateAfter==='string'?section.gateAfter.replaceAll('_',' '):'Not supplied');
      return ['gate '+gate+' between sections '+(j+1)+' and '+(j+1===run.sections.length?1:j+2)];
    });
    return 'Run '+(i+1)+': sections of '+joined+'; '+(run.closed===true?'connects back':run.closed===false?'does not connect back':'connection not supplied')+(gates.length?'; '+gates.join('; '):'');
  }).join(' | ');
  // Fence heights read the way they were entered ("5 ft 3.65 in"), never as a long decimal.
  if (field?.name === 'fenceHeight' && typeof value === 'number' && Number.isFinite(value) && value > 0) return formatFenceHeight(value);
  if (typeof value === 'number' && Number.isFinite(value) && field?.unit) return fallback(value) + ' ' + field.unit;
  if (typeof value !== 'string') return fallback(value);
  if (field?.optionLabels && Object.hasOwn(field.optionLabels,value)) return field.optionLabels[value];
  if (field?.type !== 'slug' && (field?.type !== 'enum' || !field.values?.includes(value))) return fallback(value);
  if (['sqftMethod','roofSizeMethod'].includes(field.name) && measurement[value]) return measurement[value];
  if (field.name==='grassCondition' && grass[value]) return grass[value];
  const words=value.replaceAll('_',' ').replace(/([a-z])([A-Z])/g,'$1 $2');
  return words.charAt(0).toUpperCase()+words.slice(1);
}
