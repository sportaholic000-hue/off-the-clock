// Diagnostic for the separately assigned D03 repair; not a passing regression
// that enshrines dropped notes. Expected: exact question and callback preserved.
import {db,saveKnowledgeBase} from '../../test/namedReviewContact20261006.fixture.mjs';
import {voiceHarness} from '../../test/namedReviewContact20261006.voice.fixture.mjs';
const cleanup=[],notes='[SYNTHETIC] Ask Synthetic Morgan whether the warranty covers this repair. Callback +19025550177.';
try{
  const h=await voiceHarness({after:fn=>cleanup.push(fn)});
  saveKnowledgeBase(h.owner.id,{about:'[SYNTHETIC] Test business',hours:'Weekdays',reviewContact:{name:'Synthetic Morgan',role:'manager'}});
  const {callSid}=await h.connect(),result=await h.tool('captureLead',{name:'Synthetic Caller',notes});
  const row=db.prepare('SELECT collectedInputsJson FROM leads WHERE ownerId=? AND callId=(SELECT id FROM calls WHERE callSid=? AND ownerId=?)').get(h.owner.id,callSid,h.owner.id);
  const actual=JSON.parse(row.collectedInputsJson).notes;
  console.log(JSON.stringify({expected:notes,actual,resultStatus:result.status,questionPreserved:actual===notes,notificationDelivery:'not tested; no real providers'},null,2));
  if(actual!==notes)process.exitCode=1;
}finally{for(const close of cleanup.reverse())await close();db.close();}
