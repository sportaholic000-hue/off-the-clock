// Names of the floating-floor product condition settings, kept apart from the
// condition logic so the shared tier merge can use them without importing it.
export const FLOAT_CONDITION_FIELDS=Object.freeze({laminate:'laminateFloatConditions',vinyl_plank:'vinylPlankFloatConditions'});
// Earlier saved setting names, read with exactly their meaning:
// wood_not_on_concrete was the glue-only condition.
export const LEGACY_FLOAT_CONDITION_KEYS=Object.freeze({wood_not_on_concrete:'wood_not_glued_to_concrete'});

const record=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
// One pricing level (base or one tier's overrides) with each earlier condition
// name carried under its current name. Within one level that holds both names,
// the current name keeps its value. Returns the same object when nothing
// changes; otherwise a copy, so the caller's object is never modified.
export function withCurrentFloatConditionNames(level){
  if(!record(level))return level;
  let out=level;
  for(const field of Object.values(FLOAT_CONDITION_FIELDS)){
    const set=level[field];
    if(!record(set)||!Object.keys(LEGACY_FLOAT_CONDITION_KEYS).some(old=>Object.hasOwn(set,old)))continue;
    const renamed={};
    for(const [key,value] of Object.entries(set))if(!Object.hasOwn(LEGACY_FLOAT_CONDITION_KEYS,key))renamed[key]=value;
    for(const [old,key] of Object.entries(LEGACY_FLOAT_CONDITION_KEYS))if(Object.hasOwn(set,old)&&!Object.hasOwn(renamed,key))renamed[key]=set[old];
    if(out===level)out={...level};
    out[field]=renamed;
  }
  return out;
}
