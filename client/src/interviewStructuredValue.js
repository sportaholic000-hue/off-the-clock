import {parseOwnerNumericInput} from '../../server/priceBookMoney.js';
import { humanPricingKey } from './pricebookFormatting.js';

// Pure helpers for structured interview answers: shape detection, validation
// and human-readable descriptions. Kept free of JSX so they are directly
// unit-testable and reusable by the readback.
//
// Shapes (from price-book metadata field.shapedKeys):
//   FIXED_KEYS       keys:[...]                  every key required
//   OWNER_SELECTABLE keys:[...], ownerSelectable  owner picks what they offer
//   NESTED           nested:[small,medium,large]  key x size matrix
//   OPEN             keys:null                    owner names the keys

export function structuredShape(domain) {
  if (!domain) return 'OPEN';
  if (Array.isArray(domain.nested) && domain.nested.length) return 'NESTED';
  if (domain.ownerSelectable === true) return 'OWNER_SELECTABLE';
  if (Array.isArray(domain.keys) && domain.keys.length) return 'FIXED_KEYS';
  return 'OPEN';
}

// A key is "offered" when the owner has enabled it. For owner-selectable
// domains an absent key means NOT OFFERED -- never free, never substituted.
function isBlank(value) {
  return value === undefined || value === null || value === '';
}

// Human sentence describing the answer, used for the on-screen confirmation
// and the spoken readback. Never emits JSON.
// Render one amount the way a person would say it: money leads with the
// symbol, other units follow the number. Never emits serialized data.
function speakAmount(amount, leafUnit) {
  const unit = String(leafUnit || '').trim();
  if (unit.startsWith('$')) {
    const rest = unit.replace(/^\$\s*/, '');
    return rest ? `$${amount} ${rest}` : `$${amount}`;
  }
  return unit ? `${amount} ${unit}` : String(amount);
}

export function describeStructuredValue(value, domain, fieldLabel, definition) {
  if (definition?.tree) {
    const parts=[];
    function visit(map, path=[]) {
      for (const [key, leaf] of Object.entries(map || {})) {
        const at=[...path,humanPricingKey(key)];
        if (leaf && typeof leaf==='object' && !Array.isArray(leaf)) visit(leaf,at);
        else if (!isBlank(leaf)) parts.push(at.join(' / ')+': '+(typeof leaf==='boolean' ? (leaf?'Yes':'No') : typeof leaf==='string' ? humanPricingKey(leaf) : speakAmount(leaf,domain?.leafUnit)));
      }
    }
    visit(value);
    return fieldLabel+' — '+parts.join('; ');
  }
  const shape = structuredShape(domain);
  const entries = Object.entries(value || {});

  if (!entries.length) return `No prices entered yet for ${fieldLabel}.`;

  if (shape === 'NESTED') {
    const sizes = domain.nested;
    const parts = entries.map(([key, row]) => {
      const inner = sizes
        .filter(size => !isBlank(row?.[size]))
        .map(size => `${humanPricingKey(size)} ${speakAmount(row[size], domain?.leafUnit)}`)
        .join(', ');
      return `${humanPricingKey(key)}: ${inner}`;
    });
    return `${fieldLabel} — ${parts.join('; ')}`;
  }

  const priced = entries.filter(([, amount]) => !isBlank(amount));
  const parts = priced.map(([key, amount]) => `${humanPricingKey(key)} at ${speakAmount(amount, domain?.leafUnit)}`);

  if (shape === 'OWNER_SELECTABLE') {
    const offeredKeys = priced.map(([key]) => key);
    const notOffered = (domain.keys || []).filter(key => !offeredKeys.includes(key));
    const tail = notOffered.length
      ? `. Not offered: ${notOffered.map(humanPricingKey).join(', ')}`
      : '';
    return `${fieldLabel} — ${parts.join(', ')}${tail}`;
  }

  return `${fieldLabel} — ${parts.join(', ')}`;
}

// Validation mirrors the server's activation rules so the owner is told about a
// gap here rather than after saving. It never accepts a shape the price book
// would reject.
export function validateStructuredValue(value, domain, fieldLabel, definition) {
  if (definition?.tree) return validateInterviewTree(value,definition,fieldLabel);
  // Exact parsing precedes the legacy positivity rule too: raw rejected text
  // must never become a rounded number when the owner requests a readback.
  function exactLeaves(map) {
    for(const leaf of Object.values(map || {})){
      if(leaf && typeof leaf==='object' && !Array.isArray(leaf))exactLeaves(leaf);
      else if(!isBlank(leaf))parseOwnerNumericInput(leaf,{kind:definition?.moneyKind,wholeCents:definition?.wholeCents});
    }
  }
  try{exactLeaves(value);}catch(error){return error.message;}
  const shape = structuredShape(domain);
  const entries = Object.entries(value || {});

  if (shape === 'NESTED') {
    if (!entries.length) return `Add at least one row for ${fieldLabel}.`;
    for (const [key, row] of entries) {
      for (const size of domain.nested) {
        const amount = row?.[size];
        if (isBlank(amount)) {
          return `Enter a ${humanPricingKey(size)} price for ${humanPricingKey(key)}.`;
        }
        if (!(Number(amount) > 0)) {
          return `${humanPricingKey(key)} ${humanPricingKey(size)} must be more than zero.`;
        }
      }
    }
    return null;
  }

  const priced = entries.filter(([, amount]) => !isBlank(amount));
  if (!priced.length) {
    return shape === 'OWNER_SELECTABLE'
      ? `Turn on at least one option you offer and give it a price.`
      : `Enter a price for ${fieldLabel}.`;
  }
  for (const [key, amount] of priced) {
    if (!(Number(amount) > 0)) {
      return `${humanPricingKey(key)} must be more than zero.`;
    }
  }
  if (shape === 'FIXED_KEYS') {
    const missing = (domain.keys || []).filter(key => isBlank(value?.[key]));
    if (missing.length) {
      return `Still needed: ${missing.map(humanPricingKey).join(', ')}.`;
    }
  }
  return null;
}



// This checks the interview controls' shape and exact input, not service
// activation. The server remains authoritative and may reject an incomplete
// service. In particular, zero/false are captured answers, not missing answers.
function validateInterviewTree(value, definition, fieldLabel) {
  const tree=definition.tree,depth=tree.depth||1;
  const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  function visit(map,level,path) {
    if(!record(map))throw Error(path+': enter a price map for this group.');
    const entries=Object.entries(map);
    if(!entries.length)throw Error(path+': add at least one offering or answer.');
    if(level===depth&&tree.leafKeys){
      const missing=tree.leafKeys.filter(key=>isBlank(map[key]));
      if(missing.length)throw Error(path+': still needed: '+missing.map(humanPricingKey).join(', ')+'.');
      if(entries.some(([key])=>!tree.leafKeys.includes(key)))throw Error(path+': remove unsupported fields.');
    }
    for(const [key,leaf] of entries){
      const at=path+' / '+humanPricingKey(key);
      if(!/^[a-z][a-z0-9_]*$/.test(key))throw Error(at+': use the exact supported offering key.');
      if(level<depth){visit(leaf,level+1,at);continue;}
      if(isBlank(leaf))throw Error(at+': enter an answer.');
      if(tree.leafType==='boolean'){if(typeof leaf!=='boolean')throw Error(at+': choose Yes or No.');}
      else if(tree.leafType==='enum'){if(!tree.options?.includes(leaf))throw Error(at+': choose one of the listed options.');}
      else parseOwnerNumericInput(leaf,{kind:tree.leafMoneyKinds?.[key]??definition.moneyKind,wholeCents:definition.wholeCents,path:at});
    }
  }
  try{visit(value,1,fieldLabel);return null;}catch(error){return error.message;}
}

export function parseInterviewScalar(raw, definition) {
  if(definition.type==='boolean'){
    if(raw===true||raw==='true')return true;
    if(raw===false||raw==='false')return false;
    throw Error('Choose Yes or No before confirming this field.');
  }
  if(definition.type==='select'){
    if(!definition.options?.includes(raw))throw Error('Choose one of the listed pricing options.');
    return raw;
  }
  const value=parseOwnerNumericInput(raw,{kind:definition.moneyKind,wholeCents:definition.wholeCents,path:definition.label||definition.field||''});
  if(value===undefined)throw Error('Enter a number before confirming this field.');
  return value;
}
