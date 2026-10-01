import fs from 'node:fs';
import assert from 'node:assert/strict';

// No live provider traffic. This preload is only allowed in an isolated synthetic test process.
assert.equal(process.env.NODE_ENV,'test');
assert.equal(process.env.RESEND_API_KEY,'re_SYNTHETIC_AUTH_BROWSER');
assert.equal(process.env.EMAIL_FROM,'account@example.invalid');
const file=process.env.AUTH_EMAIL_FIXTURE;
assert.ok(file && fs.existsSync(file));
globalThis.fetch=async (url, options={})=>{
  assert.equal(String(url),'https://api.resend.com/emails','Unexpected external provider request');
  assert.equal(options.headers.Authorization,'Bearer re_SYNTHETIC_AUTH_BROWSER');
  const state=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(state.syntheticOnly,true);
  const message=JSON.parse(options.body);assert.ok(message.to.every(address=>address.endsWith('@example.invalid')));
  state.calls.push({mode:state.mode,key:options.headers['Idempotency-Key']});
  if(state.mode==='unavailable'){fs.writeFileSync(file,JSON.stringify(state));return Response.json({error:'SYNTHETIC provider unavailable'},{status:503});}
  const previous=state.messages.find(m=>m.key===options.headers['Idempotency-Key']);
  if(!previous)state.messages.push({...message,key:options.headers['Idempotency-Key'],id:'synthetic-email-'+(state.messages.length+1)});
  const receipt=previous || state.messages.at(-1);
  fs.writeFileSync(file,JSON.stringify(state));
  return Response.json({id:receipt.id});
};
