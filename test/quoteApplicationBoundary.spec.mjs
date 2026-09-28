import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyExactJson } from '../server/src/exactJson.js';
import { wholeRequestIssues } from '../server/src/quoteRequestScope.js';
import { submissionCanBeEdited, submissionTooLarge } from '../client/src/quoteSubmission.js';
import { hasCallbackContact } from '../server/src/quoteContact.js';

const verify = source => verifyExactJson(null,null,Buffer.from(source),'utf8');
test('every estimate requires a syntactically usable email or telephone',()=>{
  for(const contact of [undefined,null,{},[],{name:'Only a name'},{email:' '},{email:'not-an-email',phone:''},{email:'a@@b.c'},{phone:'call me'},{phone:1234567},{phone:'1234'}]) assert.equal(hasCallbackContact(contact),false);
  for(const contact of [{email:'synthetic@example.invalid'},{phone:'+1 (902) 555-0123'},{phone:'555-0123'},{email:' invalid ',phone:'+44 20 7946 0123'}]) assert.equal(hasCallbackContact(contact),true);
});
test('wire decimals: reject replacement before save, without imposing binary exactness or price caps',()=>{
  for(const token of ['90071992547409.91','70368744177664.01','9007199254740993','1.0000000000000001','1e400','1e-400']) {
    assert.throws(()=>verify('{"nested":[{"value":'+token+'}]}'), {statusCode:400},token);
  }
  for(const token of ['200.01','90071992547409.90','1.0000','0.1','5e-3','1200','-0.25','-0','1e-300','1e300']) verify('{"value":'+token+'}');
});
test('JSON strings, escaped keys, objects and arrays are tokenized without interpreting numbers inside text',()=>{
  verify(JSON.stringify({note:'90071992547409.91 " { fake : 1e400 }',list:[{a:.1},{a:.2}],coordinate:-1.25}));
  assert.throws(()=>verify('{"context":"remove hedge","context":""}'),/Duplicate/);
  assert.throws(()=>verify('{"a":1,"\\u0061":2}'),/Duplicate/);
  assert.throws(()=>verify('{"rows":[{"a":1,"a":2}]}'),/Duplicate/);
  assert.throws(()=>verify('\uFEFF{"amount":90071992547409.91}'),{statusCode:400});
  verify('\uFEFF{"amount":200.01}');
  assert.throws(()=>verifyExactJson(null,null,Buffer.from([0xff]),'utf-8'),{statusCode:400});
  assert.throws(()=>verifyExactJson(null,null,Buffer.from('{}','utf16le'),'utf-16le'),{statusCode:415});
  verify('{"a":1,"child":{"a":2}}');
  verify('{"unfinished":'); // Express's parser owns syntax errors.
});
test('the whole-request gate never classifies untriaged prose as harmless',()=>{
  for(const empty of [undefined,null,'','  ',[],{}]) assert.deepEqual(wholeRequestIssues({context:empty,explicitUnknowns:empty},'Mowing'),[]);
  for(const explicitUnknowns of [['yardSqft'],'10000 is a guess',{yardSqft:true},false,0]) assert.ok(wholeRequestIssues({explicitUnknowns},'Mowing').length);
  for(const context of ['Bag and remove clippings','Side gate opens at noon',{note:'hedge removal'}]) assert.ok(wholeRequestIssues({context},'Mowing').length);
  assert.deepEqual(wholeRequestIssues({serviceRequest:'Mowing'},'Mowing'),[]);
  assert.ok(wholeRequestIssues({serviceRequest:'Mowing and hedges'},'Mowing').length);
  assert.ok(wholeRequestIssues({additionalServices:['hedge removal']},'Mowing').length);
  assert.ok(wholeRequestIssues({service:{}},'Mowing').length);
  assert.deepEqual(wholeRequestIssues({service:{},defaults:{},revision:'saved'},'Mowing',{preview:true}),[]);
});
test('definitive rejection can be corrected; unknown acceptance keeps the immutable request',()=>{
  for(const status of [400,401,403,404,409,413,415,422]) assert.equal(submissionCanBeEdited(status),true);
  for(const status of [undefined,0,408,429,500,502,503,504]) assert.equal(submissionCanBeEdited(status),false);
  assert.equal(submissionTooLarge({context:'a'.repeat(1048576)}),true);
  assert.equal(submissionTooLarge({context:'é'.repeat(524288)}),true);
  assert.equal(submissionTooLarge({context:'Measured project'}),false);
});
