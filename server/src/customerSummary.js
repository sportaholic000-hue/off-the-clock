import { formatFenceHeight } from '../quote-engine-vnext/configuredOfferings.js';
import {keyLabel} from '../productNames.js';
// Presentation only: original measurements and the signed submission are unchanged.
const measurement = {exact:'Measured area',assumption:'Estimated area',roof_measured:'Measured roof area',home_floor_area:'Home floor area'};
const grass = {maintained:'Regularly maintained',overgrown:'Overgrown',severe:'Severely overgrown'};
export function customerSummaryValue(field, value, fallback) {
  if(field?.type==='carpet_rooms'&&Array.isArray(value))return value.map((room,i)=>'Room '+(i+1)+': '+fallback(room?.lengthFt)+' ft front to back by '+fallback(room?.widthFt)+' ft side to side').join('; ');
  if(field?.type==='carpet_connections')return value==='unknown'?'Not sure; all rooms treated as one connected area':Array.isArray(value)?value.map(group=>'Rooms '+group.join(' and ')).join('; '):fallback(value);
  if(field?.name==='fenceRunCount'&&typeof value==='number')return value+' fence '+(value===1?'run':'runs');
  if(field?.type==='number_or_unknown'&&value==='unknown')return 'Not sure';
  if(field?.type==='fence_runs'&&Array.isArray(value))return value.map((run,i)=>{
    if(!run||!Array.isArray(run.sections))return 'Run '+(i+1)+': Not supplied';
    const lengths=run.sections.map(section=>section&&typeof section==='object'&&!Array.isArray(section)?fallback(section.lengthLF)+' ft':'Not supplied');
    const joined=lengths.length<2?lengths[0]:lengths.slice(0,-1).join(', ')+' and '+lengths.at(-1);
    const gateName=key=>field.gateChoices?.find(g=>g.value===key)?.label||(typeof key==='string'?keyLabel(key):'Not supplied');
    const gates=[...(run.gateBefore?['gate '+gateName(run.gateBefore)+' before section 1']:[]),...run.sections.flatMap((section,j)=>{
      if(!section||!section.gateAfter)return [];
      // A gate after the last section of an open run is at that run's end.
      if(j+1===run.sections.length&&run.closed===false)return ['gate '+gateName(section.gateAfter)+' after section '+(j+1)+', at the end of the run'];
      return ['gate '+gateName(section.gateAfter)+' between sections '+(j+1)+' and '+(j+1===run.sections.length?1:j+2)+(section.cornerAfterGate===true?', with a corner right after the gate':'')];
    })];
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
  const words=keyLabel(value).replace(/([a-z])([A-Z])/g,'$1 $2');
  return words.charAt(0).toUpperCase()+words.slice(1);
}
