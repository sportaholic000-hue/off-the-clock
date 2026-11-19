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
  const nextEntries=ownerMoneyEntries(output),nextKeys=new Set(nextEntries.map(moneyEntryKey));
  for(const entry of nextEntries){
    // A price in the same place belongs to this one only when its own row is gone
    // (renamed or removed); a row still present keeps its records to itself.
    const atPosition=byPosition.get(positionKey(entry));
    const prior=before.get(moneyEntryKey(entry))||(atPosition&&!nextKeys.has(moneyEntryKey(atPosition))?atPosition:undefined);
    const target=entry.scope==='tier'?output.tiers[entry.tierIndex]:output;
    // The record now stored at this place may belong to another named row.
    const here=entry.metadata&&(entry.metadata.identity===undefined||entry.metadata.identity===entry.identity)?entry.metadata:undefined;
    if(entry.identity)target.priceMetadata={...(target.priceMetadata||{}),[entry.path]:{...(prior?.metadata||here||{}),identity:entry.identity}};
    if(prior&&Object.is(prior.value,entry.value))continue;
    target.priceMetadata={...(target.priceMetadata||{}),[entry.path]:{...(target.priceMetadata?.[entry.path]||{}),aiPlaceholder:false}};
    delete target.priceMetadata[entry.path].acceptedAsOwnerPrice;
    // The earlier check date was for the earlier amount; saving keeps it off
    // unless the owner checks the new amount.
    delete target.priceMetadata[entry.path].verifiedAt;
  }
  return output;
}
