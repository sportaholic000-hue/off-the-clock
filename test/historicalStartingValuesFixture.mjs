import {loadPricebook,savePricebook} from '../server/priceBookService.js';

// October 4–15 regressions recreate previously configured services through the
// application API. Explicitly retain their historical factors: creating those
// fixtures today must not adopt October 17 proposals. Their price assertions
// are unchanged; new-service confirmation is tested independently.
export function retainHistoricalStartingValues(owner,original){
  const painting=['INTERIOR_PAINTING','EXTERIOR_PAINTING'].includes(original.serviceType);
  const flooring=['FLOORING_INSTALL','FLOORING_REPLACEMENT'].includes(original.serviceType);
  if(!painting&&!flooring)return;
  const fields=painting?['paintingSettings']:['diagonalWasteAdderByType','herringboneWasteAdderByType','herringboneLaborMultiplierByType'];
  const group=painting?'painting_coats_20261017':'flooring_patterns_20261017';
  const book=loadPricebook(owner),saved=book.services.find(row=>row.id===original.id)||book.services[0];
  for(const field of fields){
    for(const [target,source] of [[saved,original],[saved.pricing,original.pricing]]){
      if(Object.hasOwn(source||{},field))target[field]=structuredClone(source[field]);else delete target[field];
    }
    for(const path of Object.keys(saved.startingValueState||{}))if(path===field||path.startsWith(field+'.'))delete saved.startingValueState[path];
  }
  if(!Object.keys(saved.startingValueState||{}).length)delete saved.startingValueState;
  saved.startingValueAdoptions={...saved.startingValueAdoptions,[group]:{mode:'legacy'}};
  savePricebook(owner,book);
}
