import '../../test/pricebookTestEnv.mjs';
import {calculateSavedListedPrice} from '../../server/src/voice/listedPriceCalculation.js';
import {extractWebsitePrices} from '../../server/src/websitePriceExtraction.js';
import {fixture} from '../../test/leadCaptureRepair20261006Fixture.mjs';
const cleanup=[],f=fixture({after:fn=>cleanup.push(fn)}),c=f.context(),voice=f.voice(c);
const result={F7:[],F8:[]};
try{
 for(const listedItem of ['Widgets/on collection $10 each','Widgets.by arrangement $10 each','Widgets-on collection $10 each','Weather permitting $10 each','Online orders $10 each']){
  const args={listedItem,quantity:'3',customerConfirmed:true};
  f.ownerQuery('UPDATE businessProfiles SET knowledgeBaseJson=? WHERE ownerId=?').run(JSON.stringify({prices:listedItem}),c.ownerId);
  result.F7.push({listedItem,direct:calculateSavedListedPrice({prices:listedItem},args),dispatcher:await voice.tool('calculateListedPrice',args)});
 }
 for(const qualification of ['Available exclusively to members','Available to account holders','Payment by cash','Eligible customers: account holders','Prices apply to cash payments']){
  const html=`<html><body><p>${qualification}</p><div><h2>Widget</h2><p>$10 each</p></div></body></html>`;
  result.F8.push({qualification,html,result:extractWebsitePrices(html)});
 }
 console.log(JSON.stringify(result,null,2));
}finally{for(const close of cleanup.reverse())await close();}
