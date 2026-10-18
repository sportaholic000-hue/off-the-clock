import {createHmac,timingSafeEqual} from 'node:crypto';

export const VOICE_CATALOG_CHOICES=32;
export const VOICE_CATALOG_BYTES=16_384;
export const VOICE_QUESTION_CATALOG_BYTES=32_768;

// Count encoded bytes, not characters. Never split a product identity. An
// omitted choice remains available on the next page, including long Unicode.
export function voiceChoicePage(choices,{offset=0,limit=VOICE_CATALOG_CHOICES,bytes=VOICE_CATALOG_BYTES}={}){
 const page=[];let used=2;
 for(let i=offset;i<choices.length&&page.length<limit;i++){
  const size=Buffer.byteLength(JSON.stringify(choices[i]),'utf8')+(page.length?1:0);
  if(used+size>bytes)break;
  page.push(choices[i]);used+=size;
 }
 return {choices:page,bytes:used,nextOffset:offset+page.length};
}

function invalidCursor(){return Object.assign(new Error('The catalog continuation is unavailable.'),{code:'INVALID_CATALOG_CURSOR'});}
export function voiceCatalogPage({choices,field,query='',limit=16,cursor,secret,binding,expiresAt,now}){
 const search=query.trim().toLowerCase();
 const matches=search?choices.filter(choice=>(String(choice.value)+' '+choice.label).toLowerCase().includes(search)):choices;
 const sign=(offset,expiry)=>createHmac('sha256',secret).update(JSON.stringify(['voice-catalog-v1',binding,field,search,limit,offset,expiry])).digest('base64url');
 let offset=0;
 if(cursor!==undefined){
  const parts=/^v1_([0-9a-z]+)_([0-9a-z]+)_([A-Za-z0-9_-]{43})$/.exec(cursor);
  if(!parts)throw invalidCursor();
  offset=parseInt(parts[1],36);const expiry=parseInt(parts[2],36);
  if(!Number.isSafeInteger(offset)||offset<=0||offset>=matches.length||offset.toString(36)!==parts[1]||!Number.isSafeInteger(expiry)||expiry.toString(36)!==parts[2]||expiry>expiresAt||expiry<=now)throw invalidCursor();
  const expected=Buffer.from(sign(offset,expiry)),supplied=Buffer.from(parts[3]);
  if(expected.length!==supplied.length||!timingSafeEqual(expected,supplied))throw invalidCursor();
  expiresAt=expiry;
 }
 const page=voiceChoicePage(matches,{offset,limit});
 // A valid supported label fits by itself. Fail explicitly if that invariant
 // ever changes; never return an empty page with an unusable continuation.
 if(offset<matches.length&&!page.choices.length)throw new TypeError('Complete catalog choice exceeds its page budget.');
 const moreChoicesAvailable=page.nextOffset<matches.length;
 return {status:'choices',field,choices:page.choices,moreChoicesAvailable,...(moreChoicesAvailable?{nextCursor:`v1_${page.nextOffset.toString(36)}_${expiresAt.toString(36)}_${sign(page.nextOffset,expiresAt)}`}:{})};
}
