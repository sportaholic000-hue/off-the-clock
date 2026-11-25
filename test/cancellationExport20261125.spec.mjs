import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,A,B,prices} from './overageMinute20261006Fixture.mjs';
import {createBillingCustomerLifecycle,CANCELLATION_EXPORT_COLUMNS} from '../server/src/billingCustomerLifecycle.js';
import {installTelephonyOperationsSchema} from '../server/src/telephonyOperationsMigration.js';
import {csvCell} from '../server/src/integrationData.js';

// The export owners can download for 90 days after service ends. It used SELECT *, so
// it carried the platform's Twilio account id, the AI usage and cost of each call and
// each customer's quote-link token, and it protected fewer formula forms than the
// regular exports. Real lifecycle service on the overage fixture's database.
// HANDWRITTEN EXPECTATIONS, before execution:
// - the header of each kind is exactly its owner-facing column list; none of accountSid,
//   streamSid, callSid, aiInputTokens, aiOutputTokens, aiEstimatedCostMicros, pageToken,
//   pageExpiresAt or ownerId appears;
// - a name with a leading space before "=", a full-width "＝" or a control character
//   before "=" is written exactly as csvCell writes it (prefixed with ');
// - another owner's rows never appear; the file starts with the UTF-8 byte-order mark.
function setup(t){
  const f=fixture(t,{});installTelephonyOperationsSchema(f.db);
  const lifecycle=createBillingCustomerLifecycle({database:f.db,priceIds:prices,stripeClient:f.fakes.stripe,emailProvider:f.fakes.email,
    enabled:()=>true,clock:f.clock,dashboardUrl:'https://synthetic.example.invalid/settings',telephony:{},releaseNumber:async()=>({released:true})});
  return {f,lifecycle};
}
const parse=csv=>csv.replace(/^﻿/,'').trimEnd().split('\r\n');
test('cancellation export: owner columns only, for every kind',t=>{
  const {f,lifecycle}=setup(t),now=new Date().toISOString();
  f.db.prepare("INSERT INTO calls(id,ownerId,callSid,accountSid,streamSid,callerNumber,destinationNumber,status,transcriptJson,aiInputTokens,aiOutputTokens,aiEstimatedCostMicros,createdAt,updatedAt) VALUES('call-probe',?,?,?,?,'+15065550101','+15065550199','COMPLETED','[]',900,400,1234,?,?)")
    .run(A,'CA'+'a'.repeat(32),'AC'+'b'.repeat(32),'MZ'+'c'.repeat(32),now,now);
  for(const kind of ['leads','quotes','calls']){
    const csv=lifecycle.exportCsv(A,kind);assert.ok(csv.startsWith('﻿'));
    assert.equal(parse(csv)[0],CANCELLATION_EXPORT_COLUMNS[kind].map(csvCell).join(','));
    for(const hidden of ['accountSid','streamSid','callSid','aiInputTokens','aiOutputTokens','aiEstimatedCostMicros','pageToken','pageExpiresAt','ownerId'])
      assert.ok(!parse(csv)[0].includes('"'+hidden+'"'),kind+' leaks '+hidden);
  }
  const calls=lifecycle.exportCsv(A,'calls');
  assert.ok(!calls.includes('AC'+'b'.repeat(32))&&!calls.includes('MZ'+'c'.repeat(32))&&!calls.includes('CA'+'a'.repeat(32)));
  assert.ok(calls.includes('"call-probe"'));
});
test('cancellation export: the same formula protection as the regular exports',t=>{
  const {f,lifecycle}=setup(t),now=new Date().toISOString();
  const names=[' =HYPERLINK("http://x.invalid","click")','＝1+1','\u0001=2+2','=SUM(A1)','plain name'];
  names.forEach((name,i)=>f.db.prepare("INSERT INTO leads(id,ownerId,customerName,callerNumber,describedService,type,status,createdAt) VALUES(?,?,?,?,?,'lead','NEW',?)").run('lead-'+i,A,name,'+15065550101','roof',now));
  f.db.prepare("INSERT INTO leads(id,ownerId,customerName,callerNumber,describedService,type,status,createdAt) VALUES('lead-other',?,?,?,?,'lead','NEW',?)").run(B,'other owner','+15065550102','roof',now);
  const csv=lifecycle.exportCsv(A,'leads');
  for(const name of names)assert.ok(csv.includes(csvCell(name)),JSON.stringify(name));
  for(const name of names.slice(0,4))assert.ok(csvCell(name).startsWith('"\''),'csvCell protects '+JSON.stringify(name));
  assert.ok(!csv.includes('lead-other')&&!csv.includes('other owner'));
});
