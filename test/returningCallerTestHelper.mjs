// Synthetic caller explicitly confirms the server-issued identity question.
// Every lookup uses the same call-scoped runtime, as the production stream does.
import {usageOwnerQuery} from '../server/src/billingUsagePolicy.js';
export async function confirmedHistory(database,context,lookup){
 const first=await lookup({});if(first.status==='not_found')return first;
 if(first.status!=='identity_unconfirmed')throw Error('History was disclosed before identity confirmation.');
 const ownerQuery=usageOwnerQuery(database),row=ownerQuery('SELECT transcriptJson FROM calls WHERE ownerId=? AND callSid=?').get(context.ownerId,context.callSid);
 const transcript=JSON.parse(row?.transcriptJson||'[]');transcript.push({role:'assistant',text:first.message,final:true},{role:'caller',text:'Yes, speaking.',final:true});
 ownerQuery('UPDATE calls SET transcriptJson=? WHERE ownerId=? AND callSid=?').run(JSON.stringify(transcript),context.ownerId,context.callSid);
 return lookup({callerConfirmedIdentity:true});
}
