export const KNOWLEDGE_TEXT_FIELDS=['about','hours','services','policies','faqs','prices'];
export const knowledgeFieldLabel=field=>({about:'About & area',hours:'Hours',services:'Services',policies:'Policies',faqs:'FAQs',prices:'Your prices',neverSay:'Never say'}[field]||field);
export const settingError=(setting,message)=>Object.assign(new Error(message),{statusCode:400,code:'INVALID_REQUEST',setting});
export function identityLabel(value,setting){
 if(typeof value!=='string'||!value.trim()||value.length>500||/[\u0000-\u001f\u007f]/.test(value))throw settingError(setting,setting+' must be non-empty text of at most 500 characters, without control characters.');
 return value;
}
export function pricingLabel(value,setting){
 identityLabel(value,setting);
 if(/[$€£]|\b(?:CAD|USD)\s*\d|\d[\d.,]*\s*(?:dollars?|cents?|\/\s*(?:hour|hr|sq|foot|ft))|\b(?:rate|cost|markup|margin)\b[^\n]{0,30}\d/i.test(value))throw settingError(setting,setting+' must contain a name only. Put prices and rates in the pricing fields.');
 return value;
}
export function validateKnowledge(knowledge){
 if(!knowledge||typeof knowledge!=='object'||Array.isArray(knowledge))throw settingError('Business knowledge','Business knowledge must be an object.');
 const text=(value,setting)=>{if(value===undefined||value===null)return;if(typeof value!=='string')throw settingError(setting,setting+' must be text.');if(value.length>20000)throw settingError(setting,setting+' is too long (limit 20,000 characters).');};
 for(const field of KNOWLEDGE_TEXT_FIELDS)text(knowledge[field],knowledgeFieldLabel(field));
 if(knowledge.neverSay!==undefined&&(!Array.isArray(knowledge.neverSay)||knowledge.neverSay.length>200))throw settingError('Never say','Never say must contain at most 200 lines.');
 for(const line of knowledge.neverSay||[])text(line,'Never say');
 return knowledge;
}
export function validatePricebookReceptionistSettings(book){
 for(const service of book.services||[]){
  if(service.service!==undefined&&service.service!=='')pricingLabel(service.service,'Service name');
  const products=Object.values(service.knownOfferings||{}).flatMap(group=>Object.keys(group||{}));
  if(products.length>1000)throw settingError('Registered products','Each service can have at most 1,000 registered products across all product fields.');
  for(const product of products)pricingLabel(product.replaceAll('_',' '),'Product name');
 }
}
