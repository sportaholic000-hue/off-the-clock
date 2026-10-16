import {ownerMoneyEntries} from '../../server/priceBookMoney.js';

function moneyEntryKey(entry) {
  return JSON.stringify([entry.scope,entry.tierName??entry.tierIndex??null,entry.identity||entry.path]);
}

export function markEditedPriceMetadata(previous,next) {
  const entries=ownerMoneyEntries(previous);
  const positionKey=entry=>JSON.stringify([entry.scope,entry.tierIndex??null,entry.path]);
  const before=new Map(entries.map(entry=>[moneyEntryKey(entry),entry]));
  const byPosition=new Map(entries.map(entry=>[positionKey(entry),entry]));
  const output=JSON.parse(JSON.stringify(next));
  for(const entry of ownerMoneyEntries(output)){
    const prior=before.get(moneyEntryKey(entry))||byPosition.get(positionKey(entry));
    const target=entry.scope==='tier'?output.tiers[entry.tierIndex]:output;
    if(entry.identity)target.priceMetadata={...(target.priceMetadata||{}),[entry.path]:{...(prior?.metadata||entry.metadata||{}),identity:entry.identity}};
    if(prior&&Object.is(prior.value,entry.value))continue;
    target.priceMetadata={...(target.priceMetadata||{}),[entry.path]:{...(target.priceMetadata?.[entry.path]||{}),aiPlaceholder:false}};
    delete target.priceMetadata[entry.path].acceptedAsOwnerPrice;
  }
  return output;
}
