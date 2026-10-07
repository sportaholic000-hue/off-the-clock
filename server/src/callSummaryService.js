// Extractive summary: transcript text is quoted data, never an instruction.
// Keep attribution; never convert an assistant promise into a confirmed fact.
export function transcriptSummary(serialized) {
  let turns;try{turns=JSON.parse(serialized);}catch{return null;}
  if(!Array.isArray(turns))return null;
  const eligible=turns.filter(turn=>turn&&['user','caller','assistant','model'].includes(turn.role)&&turn.final!==false&&typeof turn.text==='string'&&turn.text.trim());
  const chosen=eligible.length>6?[...eligible.slice(0,3),...eligible.slice(-3)]:eligible;
  return chosen.map(turn=>{
    const label=['user','caller'].includes(turn.role)?'Caller':'Assistant';
    const words=turn.text.trim();return label+': '+words.slice(0,300)+(words.length>300?'…':'');
  }).join('\n')||null;
}
export function completeVoiceCall({database,ownerId,callId,callSid,outcome,streamSid,duration,at,preserveLifecycle=false}) {
  const query=sql=>{if(!/\bownerId\b/.test(sql))throw Error('Call completion requires tenant-bound queries.');return database.prepare(sql);};
  const work=()=>{
    const call=query('SELECT transcriptJson,status,spamFiltered,outcome FROM calls WHERE ownerId=? AND id=? AND callSid=?').get(ownerId,callId,callSid);
    if(!call)throw Error('Call binding lost.');
    const linked=`(EXISTS(SELECT 1 FROM quotes q WHERE q.ownerId=a.ownerId AND q.id=a.quoteId AND q.callId=?) OR
      EXISTS(SELECT 1 FROM bookingIntents i WHERE i.ownerId=a.ownerId AND i.id=a.bookingIntentId AND
        ((i.sourceType='quote' AND EXISTS(SELECT 1 FROM quotes q WHERE q.ownerId=i.ownerId AND q.id=i.sourceId AND q.callId=?)) OR
         (i.sourceType='lead' AND EXISTS(SELECT 1 FROM leads l WHERE l.ownerId=i.ownerId AND l.id=i.sourceId AND l.callId=?)))))`;
    let semantic='INFO';
    if(call.spamFiltered)semantic='SPAM';
    else if(query(`SELECT 1 FROM appointments a WHERE a.ownerId=? AND a.status='CONFIRMED' AND ${linked} LIMIT 1`).get(ownerId,callId,callId,callId))semantic='BOOKED';
    else if(query("SELECT 1 FROM quotes WHERE ownerId=? AND callId=? AND status IN ('INSTANT','PARTIAL') LIMIT 1").get(ownerId,callId))semantic='QUOTED';
    else if(query('SELECT 1 FROM quoteRequests WHERE ownerId=? AND callId=? LIMIT 1').get(ownerId,callId))semantic='QUOTE_REQUEST';
    else if(query("SELECT 1 FROM outboxEvents WHERE ownerId=? AND eventType='voice.transfer_requested' AND status IN ('CONFIRMED','CONNECTED') AND json_valid(payloadJson) AND json_extract(payloadJson,'$.callSid')=? LIMIT 1").get(ownerId,callSid))semantic='TRANSFERRED';
    else if(query('SELECT 1 FROM leads WHERE ownerId=? AND callId=? LIMIT 1').get(ownerId,callId))semantic='LEAD';
    if(preserveLifecycle){
      // The lifecycle store owns terminal/fallback/transfer status and timing.
      // Enrich its committed call without reopening it or erasing billing exclusions.
      const preserveOutcome=call.outcome==='AI_FALLBACK'||['FALLBACK','AI_FALLBACK','TRANSFERRING','RECOVERED'].includes(call.status);
      query('UPDATE calls SET outcome=?,transportOutcome=?,summaryText=?,updatedAt=? WHERE ownerId=? AND id=? AND callSid=?')
        .run(preserveOutcome?call.outcome:semantic,outcome.reason,transcriptSummary(call.transcriptJson),at,ownerId,callId,callSid);
      return;
    }
    // Transport failure remains explicit; semantic outcome describes saved work.
    query(`UPDATE calls SET status=?,outcome=?,transportOutcome=?,summaryText=?,failureCode=?,streamSid=?,duration=?,completedAt=?,updatedAt=?
      WHERE ownerId=? AND id=? AND callSid=?`).run(outcome.status==='failed'?'FAILED':'COMPLETED',semantic,outcome.reason,transcriptSummary(call.transcriptJson),outcome.status==='failed'?outcome.reason:null,streamSid,duration,at,at,ownerId,callId,callSid);
  };
  if(database.inTransaction===true||database.isTransaction===true)return work();
  database.exec('BEGIN IMMEDIATE');
  try{const result=work();database.exec('COMMIT');return result;}catch(error){database.exec('ROLLBACK');throw error;}
}
