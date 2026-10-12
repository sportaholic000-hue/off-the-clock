import {usageOwnerQuery,usageTransaction} from './billingUsagePolicy.js';
import {retainCalendarRefreshToken} from './calendarRetentionRevocation.js';

const DAY=86400000,VERSION=2;
const finished=step=>['DONE','NOT_REQUIRED'].includes(step?.status);
const terminal=step=>finished(step)||step?.status==='PERMANENT_FAILURE';
const failureCode=(error,fallback)=>/^(?:OFFSITE_|BACKUP_|RETENTION_)[A-Z0-9_]+$/.test(error?.code||error?.message)?error.code||error.message:fallback;

// Cleanup metadata is billing cancellation evidence. Retry secrets are kept in
// their own non-exported table, removed immediately on success/permanent failure,
// and excluded from every newly captured backup.
export function createBillingRetentionSteps({database,ownerQuery,clock=()=>new Date(),enabled=()=>false,
  revokeCalendar,releaseNumber,eraseLocal,eraseBackups,cleanupRetryCopies=async()=>{}}={}){
  const query=usageOwnerQuery(database,ownerQuery),now=()=>clock().toISOString();
  const secrets=ownerId=>query('SELECT * FROM billingRetentionSecrets WHERE ownerId=?').get(ownerId);
  function clearSecret(ownerId,kind){
    if(kind==='calendar')query('UPDATE billingRetentionSecrets SET credentialsCiphertext=NULL,credentialsIv=NULL,credentialsTag=NULL,keyVersion=NULL WHERE ownerId=?').run(ownerId);
    else query('UPDATE billingRetentionSecrets SET phoneNumberSid=NULL WHERE ownerId=?').run(ownerId);
    query('DELETE FROM billingRetentionSecrets WHERE ownerId=? AND credentialsCiphertext IS NULL AND phoneNumberSid IS NULL').run(ownerId);
  }
  function clearPhoneSource(ownerId){
    query("UPDATE businessProfiles SET twilioNumber=NULL,twilioNumberSid=NULL,operatorEnabled=0,phoneProvisioningStatus='not_started' WHERE ownerId=?").run(ownerId);
    query('DELETE FROM phoneProvisioningOperations WHERE ownerId=?').run(ownerId);
    query('DELETE FROM operatorCoverageOperations WHERE ownerId=?').run(ownerId);
  }
  async function process(ownerId,row,{deadlineAt=now(),assertLease=()=>{},prepareOnly=false}={}){
    const at=now(),due90=Date.parse(deadlineAt)>=Date.parse(row.endAt)+90*DAY,due30=Date.parse(deadlineAt)>=Date.parse(row.endAt)+30*DAY;
    if(!due30||row.dataErasureVersion===VERSION&&row.dataDeletedAt)return;
    database.exec('PRAGMA secure_delete=ON');
    let state=row.retentionStateJson?JSON.parse(row.retentionStateJson):null;
    if(!state||state.version!==VERSION||state.operationId!==row.operationId)state={version:VERSION,operationId:row.operationId,steps:{}};
    const steps=state.steps,errors=[];
    const save=()=>{
      assertLease();
      query('UPDATE billingCancellations SET retentionStateJson=?,updatedAt=? WHERE ownerId=? AND operationId=?')
        .run(JSON.stringify(state),now(),ownerId,row.operationId);
    };
    function flushDeletedSecrets(){
      if(!state.flushPending)return;
      try{
        // secure_delete zeros the current page; checkpoint/truncate also removes
        // the preceding encrypted token/SID from the main file and WAL history.
        if(database.prepare('PRAGMA wal_checkpoint(TRUNCATE)').all().some(row=>row.busy))throw Object.assign(Error('RETENTION_DATABASE_BUSY'),{code:'RETENTION_DATABASE_BUSY'});
        state.flushPending=false;
      }catch(error){errors.push(error);}
      save();
    }
    function permanentlyFail(kind,reason){
      steps[kind]={...steps[kind],status:'PERMANENT_FAILURE',outcome:reason,failedAt:now()};
      state.flushPending=true;
      usageTransaction(database,()=>{
        // The retry deadline governs live material independently of access to
        // abandoned copies. Persist their non-secret cleanup obligation in the
        // same transaction as deletion, before any external lock can block us.
        if(state.retryCopies?.status!=='PENDING')state.retryCopies={status:'PENDING',firstAttemptAt:now(),outcome:'RETENTION_STAGING_PENDING'};
        clearSecret(ownerId,kind);
        if(kind==='calendar')query("UPDATE billingCancellations SET calendarRevokeStatus='PERMANENT_FAILURE' WHERE ownerId=? AND operationId=?").run(ownerId,row.operationId);
        else clearPhoneSource(ownerId);
        save();
      });
      if(database.inTransaction!==true&&database.isTransaction!==true)flushDeletedSecrets();
    }
    async function cleanupPendingCopies(){
      if(state.retryCopies?.status!=='PENDING')return;
      try{
        await cleanupRetryCopies();assertLease();
        state.retryCopies={...state.retryCopies,status:'DONE',outcome:'ERASED',completedAt:now()};
      }catch(error){
        assertLease();state.retryCopies.outcome=failureCode(error,'RETENTION_STAGING_PENDING');
        state.retryCopies.lastAttemptAt=now();errors.push(error);
      }
      save();
    }
    // Capture both retry values before deleting any profile/connection. No
    // provider request is made here, so a provider outage cannot delay erasure.
    usageTransaction(database,()=>{
      if(!steps.phone){
        steps.phone={status:'PENDING',firstAttemptAt:at};
        const profile=query('SELECT twilioNumberSid FROM businessProfiles WHERE ownerId=?').get(ownerId);
        if(row.phoneReleasedAt)steps.phone={status:'DONE',outcome:'RELEASED',completedAt:row.phoneReleasedAt};
        else if(profile?.twilioNumberSid){
          if(!/^PN[0-9a-f]{32}$/i.test(profile.twilioNumberSid))steps.phone.discardReason='PHONE_SID_INVALID';
          else query('INSERT INTO billingRetentionSecrets(ownerId,phoneNumberSid) VALUES(?,?) ON CONFLICT(ownerId) DO UPDATE SET phoneNumberSid=excluded.phoneNumberSid')
            .run(ownerId,profile.twilioNumberSid);
        }else if(row.dataDeletedAt&&!profile)steps.phone.discardReason='PHONE_RETRY_MATERIAL_UNAVAILABLE';
        else steps.phone={status:'NOT_REQUIRED',outcome:'NO_SAVED_NUMBER',completedAt:at};
      }
      if(due90&&!steps.calendar){
        steps.calendar={status:'PENDING',firstAttemptAt:at};
        const connection=query("SELECT * FROM calendarConnections WHERE ownerId=? AND provider='google'").get(ownerId);
        if(connection){
          let retained;
          try{retained=revokeCalendar?.retain?revokeCalendar.retain(connection):retainCalendarRefreshToken(connection);}
          catch{steps.calendar.discardReason='CALENDAR_TOKEN_UNREADABLE';}
          if(retained)query(`INSERT INTO billingRetentionSecrets(ownerId,credentialsCiphertext,credentialsIv,credentialsTag,keyVersion)
            VALUES(?,?,?,?,?) ON CONFLICT(ownerId) DO UPDATE SET credentialsCiphertext=excluded.credentialsCiphertext,
            credentialsIv=excluded.credentialsIv,credentialsTag=excluded.credentialsTag,keyVersion=excluded.keyVersion`)
            .run(ownerId,retained.credentialsCiphertext,retained.credentialsIv,retained.credentialsTag,retained.keyVersion);
        }else if(['REVOKED','ALREADY_REVOKED'].includes(row.calendarRevokeStatus))steps.calendar={status:'DONE',outcome:row.calendarRevokeStatus,completedAt:row.calendarRevokeAttemptedAt};
        else if(row.calendarRevokeStatus||row.dataDeletedAt)steps.calendar.discardReason='CALENDAR_RETRY_MATERIAL_UNAVAILABLE';
        else steps.calendar={status:'NOT_REQUIRED',outcome:'NO_SAVED_GRANT',completedAt:at};
      }
      if(due90){
        steps.local||={status:'PENDING',firstAttemptAt:at};steps.backups||={status:'PENDING',firstAttemptAt:at};
        // A legacy v1 timestamp did not prove successful provider/remote steps.
        if(row.dataDeletedAt&&row.dataErasureVersion!==VERSION)query('UPDATE billingCancellations SET dataDeletedAt=NULL,dataErasureVersion=0 WHERE ownerId=? AND operationId=?').run(ownerId,row.operationId);
      }
      save();
    });
    flushDeletedSecrets();
    // Local deletion runs first and each failure is isolated. Successful local
    // deletion never waits for an off-site request, Google, or the carrier.
    if(due90&&!finished(steps.local)){
      try{
        await eraseLocal(ownerId,assertLease);assertLease();
        steps.local={...steps.local,status:'DONE',completedAt:now(),outcome:'ERASED'};
        // Backups verified during a failed local-file attempt must be checked
        // again after that file is gone: a worker could have captured it again.
        if(finished(steps.backups))steps.backups={...steps.backups,status:'PENDING'};
      }catch(error){assertLease();steps.local.outcome=failureCode(error,'RETENTION_LOCAL_PENDING');errors.push(error);}
      save();
    }
    // Expiry is local work, including during the sweep's preparation pass.
    // Do not wait behind off-site erasure or abandoned-copy lock acquisition.
    for(const kind of ['calendar','phone']){
      const step=steps[kind];
      if(step&&!terminal(step)){
        if(step.discardReason)permanentlyFail(kind,step.discardReason);
        else if(clock().getTime()>=Date.parse(step.firstAttemptAt)+30*DAY)permanentlyFail(kind,'RETRY_WINDOW_EXPIRED');
      }
    }
    if(prepareOnly){
      if(errors.length)throw errors[0];
      // processOwner may reactivate retained data after this call. Keep that
      // transition from clearing our ledger before the external pass runs.
      if(state.retryCopies?.status==='PENDING')throw Error('RETENTION_STAGING_PENDING');
      return;
    }
    async function backupStep(){
      if(!due90||finished(steps.backups))return;
      try{if(eraseBackups)await eraseBackups(ownerId);assertLease();steps.backups={...steps.backups,status:'DONE',outcome:'ERASED',completedAt:now()};}
      catch(error){assertLease();steps.backups.outcome=failureCode(error,'RETENTION_BACKUPS_PENDING');errors.push(error);}
      save();
    }
    async function providerStep(kind){
      const step=steps[kind];if(!step||terminal(step))return;
      async function copiesCleared(){
        try{await cleanupRetryCopies();assertLease();return true;}
        catch(error){assertLease();step.outcome=failureCode(error,'RETENTION_STAGING_PENDING');errors.push(error);save();return false;}
      }
      function discard(reason){permanentlyFail(kind,reason);}
      if(step.discardReason){await discard(step.discardReason);return;}
      if(clock().getTime()>=Date.parse(step.firstAttemptAt)+30*DAY){await discard('RETRY_WINDOW_EXPIRED');return;}
      const kept=secrets(ownerId);
      if(kind==='calendar'?!kept?.credentialsCiphertext:!kept?.phoneNumberSid){await discard('RETRY_MATERIAL_UNAVAILABLE');return;}
      let outcome='PROVIDER_DISABLED';
      if(enabled()){
        if(kind==='calendar'){
          query("UPDATE billingCancellations SET calendarRevokeAttemptedAt=COALESCE(calendarRevokeAttemptedAt,?),calendarRevokeStatus='ATTEMPTING' WHERE ownerId=? AND operationId=?").run(step.firstAttemptAt,ownerId,row.operationId);
          try{outcome=revokeCalendar?await revokeCalendar(kept):'UNAVAILABLE';}catch{outcome='FAILED';}
          if(!['REVOKED','ALREADY_REVOKED','FAILED','TIMEOUT','UNREADABLE','PROVIDER_DISABLED','UNAVAILABLE'].includes(outcome))outcome='FAILED';
        }else{
          try{outcome=releaseNumber&&(await releaseNumber({ownerId,sid:kept.phoneNumberSid}))?.released===true?'RELEASED':'UNAVAILABLE';}
          catch(error){outcome=(error.statusCode===404||error.status===404)?'ALREADY_RELEASED':'FAILED';}
        }
      }
      assertLease();
      if(outcome==='UNREADABLE'){await discard('CALENDAR_TOKEN_UNREADABLE');return;}
      // A request may finish at/after the retry deadline. Confirmed success is
      // still recorded truthfully; failure discards the secret at that boundary.
      const done=['REVOKED','ALREADY_REVOKED','RELEASED','ALREADY_RELEASED'].includes(outcome);
      if(!done&&clock().getTime()>=Date.parse(step.firstAttemptAt)+30*DAY){await discard('RETRY_WINDOW_EXPIRED');return;}
      if(done&&!await copiesCleared())return;
      usageTransaction(database,()=>{
        steps[kind]={...step,status:done?'DONE':'PENDING',outcome,...(done?{completedAt:now()}:{lastAttemptAt:now()})};
        if(kind==='calendar')query('UPDATE billingCancellations SET calendarRevokeAttemptedAt=COALESCE(calendarRevokeAttemptedAt,?),calendarRevokeStatus=? WHERE ownerId=? AND operationId=?').run(step.firstAttemptAt,outcome,ownerId,row.operationId);
        if(done){
          state.flushPending=true;
          clearSecret(ownerId,kind);
          if(kind==='phone'){
            clearPhoneSource(ownerId);
            query('UPDATE billingCancellations SET phoneReleasedAt=? WHERE ownerId=? AND operationId=?').run(now(),ownerId,row.operationId);
          }
        }
        save();
      });
      if(done)flushDeletedSecrets();
    }
    // The backup and terminal-provider barriers use the same volume lock.
    // Finish each before starting the next; never recursively wait on a peer.
    await backupStep();await providerStep('calendar');await providerStep('phone');
    // This is deliberately outside providerStep's terminal early return. It
    // must survive reconstruction and run after retries have permanently ended.
    await cleanupPendingCopies();
    const copiesPending=state.retryCopies?.status==='PENDING';
    if(due90&&!state.flushPending&&!copiesPending&&['local','backups','calendar','phone'].every(kind=>finished(steps[kind]))){
      query('UPDATE billingCancellations SET dataDeletedAt=?,dataErasureVersion=?,lastError=NULL,updatedAt=? WHERE ownerId=? AND operationId=?').run(now(),VERSION,now(),ownerId,row.operationId);
    }else if(state.flushPending||copiesPending||Object.values(steps).some(step=>!finished(step))){
      query('UPDATE billingCancellations SET lastError=?,updatedAt=? WHERE ownerId=? AND operationId=?')
        .run(Object.values(steps).some(step=>step.status==='PERMANENT_FAILURE')?'RETENTION_MANUAL_ACTION_REQUIRED':'RETENTION_PENDING',now(),ownerId,row.operationId);
    }
    if(errors.length)throw errors[0];
  }
  function retentionStatus(){
    // Admin-only inventory; no credentials, SIDs, names, email, or provider bodies.
    const rows=database.prepare(`SELECT ownerId,endAt,retentionStateJson,dataErasureVersion,dataDeletedAt,calendarRevokeStatus FROM billingCancellations
      WHERE state IN ('CONFIRMED','ENDED') ORDER BY ownerId`).all();
    const pending=[],permanentFailures=[];
    for(const row of rows){
      if(row.dataErasureVersion===VERSION&&row.dataDeletedAt)continue;
      let state;try{state=JSON.parse(row.retentionStateJson||'null');}catch{}
      const steps=state?.steps||{},unresolved=Object.entries(steps).filter(([,step])=>!finished(step));
      if(state?.flushPending)unresolved.push(['storage',{status:'PENDING',outcome:'RETENTION_DATABASE_BUSY'}]);
      if(state?.retryCopies?.status==='PENDING')unresolved.push(['retryCopies',state.retryCopies]);
      // A lease or a stopped sweep must not hide overdue work. Deadlines are
      // derived from the provider's service end, not from step initialization.
      const age=clock().getTime()-Date.parse(row.endAt),due=[];
      if(age>=30*DAY)due.push('phone');
      if(age>=90*DAY){
        due.push('local','backups');
        const connected=query("SELECT 1 FROM calendarConnections WHERE ownerId=? AND provider='google'").get(row.ownerId);
        if(connected||row.calendarRevokeStatus)due.push('calendar');
      }
      for(const step of due)if(!steps[step])pending.push({ownerId:row.ownerId,step,outcome:'RETENTION_NOT_STARTED'});
      for(const [step,value] of unresolved){
        const entry={ownerId:row.ownerId,step,firstAttemptAt:value.firstAttemptAt,outcome:value.outcome||'PENDING'};
        if(value.status==='PERMANENT_FAILURE')permanentFailures.push({...entry,failedAt:value.failedAt});else pending.push(entry);
      }
    }
    return {ok:!pending.length&&!permanentFailures.length,pendingOwners:new Set(pending.map(row=>row.ownerId)).size,pending,permanentFailures};
  }
  function syncAdminAlert(){
    const status=retentionStatus(),detailsJson=JSON.stringify({pendingOwners:status.pendingOwners,permanentFailures:status.permanentFailures.length});
    // One anonymous platform alert, containing counts only. Tenant identities
    // remain in the authenticated admin inventory above, never in alert details.
    const existing=database.prepare("SELECT detailsJson,resolvedAt FROM voicePlatformAlerts WHERE eventKey='retention'").get();
    if(!status.ok){
      if(!existing||existing.detailsJson!==detailsJson||existing.resolvedAt)database.prepare(`INSERT INTO voicePlatformAlerts(eventKey,code,detailsJson,createdAt,updatedAt)
        VALUES('retention','TENANT_ERASURE_ACTION_REQUIRED',?,?,?) ON CONFLICT(eventKey) DO UPDATE SET detailsJson=excluded.detailsJson,updatedAt=excluded.updatedAt,resolvedAt=NULL`).run(detailsJson,now(),now());
    }else if(existing&&!existing.resolvedAt)database.prepare("UPDATE voicePlatformAlerts SET resolvedAt=?,updatedAt=? WHERE eventKey='retention'").run(now(),now());
    return status;
  }
  return {process,retentionStatus,syncAdminAlert};
}
