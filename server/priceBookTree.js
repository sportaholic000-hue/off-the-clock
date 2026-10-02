import {parseOwnerNumericInput} from './priceBookMoney.js';

// The current metadata contract is shared by owner controls and the AI write
// boundary. Closed choices and required choices are deliberately separate:
// contractors may offer a subset of flooring/siding types.
export function treeKeysAt(tree, level) {
  return level === (tree.depth || 1) && tree.leafKeys ? tree.leafKeys
    : level === 1 ? tree.rootKeys : undefined;
}
export function requiredTreeKeysAt(tree, level) {
  return [...new Set([...(level === 1 ? tree.requiredRootKeys || [] : []),
    ...(level === (tree.depth || 1) ? tree.leafKeys || [] : [])])];
}
export function validatePriceBookTree(value, definition, {numbersOnly=false}={}) {
  const tree=definition.tree, depth=tree.depth||1;
  const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  let count=0;
  function visit(map,level,path) {
    if(!record(map)||!Object.keys(map).length)throw Error(path+': enter a non-empty price map.');
    const allowed=treeKeysAt(tree,level);
    for(const key of requiredTreeKeysAt(tree,level))if(!Object.hasOwn(map,key))throw Error(path+': still needed: '+key+'.');
    for(const [key,leaf] of Object.entries(map)) {
      const at=path+'.'+key;
      if(++count>1000||['__proto__','constructor','prototype'].includes(key)||
        (allowed ? !allowed.includes(key) : !/^[a-z][a-z0-9_]*$/.test(key)))throw Error(at+': unsupported offering key.');
      if(level<depth){visit(leaf,level+1,at);continue;}
      if(leaf===undefined||leaf===null||leaf==='')throw Error(at+': enter an answer.');
      if(tree.leafType==='boolean'){if(typeof leaf!=='boolean')throw Error(at+': choose Yes or No.');}
      else if(tree.leafType==='enum'){if(!tree.options?.includes(leaf))throw Error(at+': choose a supported price basis.');}
      else {
        if(numbersOnly&&(typeof leaf!=='number'||!Number.isFinite(leaf)||leaf>Number.MAX_SAFE_INTEGER))throw Error(at+': enter a finite numeric value.');
        const number=parseOwnerNumericInput(leaf,{kind:tree.leafMoneyKinds?.[key]??definition.moneyKind,wholeCents:definition.wholeCents,path:at});
        if(tree.positiveLeafKeys?.includes(key)&&!(number>0))throw Error(at+': must be more than zero.');
      }
    }
  }
  visit(value,1,definition.label||definition.field);
}
