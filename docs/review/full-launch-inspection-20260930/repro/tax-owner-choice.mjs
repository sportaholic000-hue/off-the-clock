import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import crypto from 'node:crypto';
const root=resolve(process.argv[2]),out=resolve(process.argv[3]);mkdirSync(out,{recursive:true});
const require=createRequire(resolve(root,'server/package.json'));const Database=require('better-sqlite3'),jwt=require('jsonwebtoken');
const {migrateDatabase}=await import(pathToFileURL(resolve(root,'server/src/migrations.js')));
const databasePath=resolve(out,'synthetic-tax.sqlite'),database=new Database(databasePath);database.pragma('foreign_keys=ON');database.pragma('journal_mode=WAL');migrateDatabase(database);
const id=crypto.randomUUID(),key=crypto.randomBytes(32).toString('hex');
database.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,role,createdAt) VALUES(?,?,'synthetic-unusable-password','Synthetic','[SYNTHETIC] Tax Audit','QuoteDone','active','owner',?)").run(id,id+'@example.invalid',new Date().toISOString());database.close();
const token=jwt.sign({sub:id,role:'owner',email:id+'@example.invalid'},key,{expiresIn:'5m'});
const port=4605,base='http://127.0.0.1:'+port;
let child=spawn(process.execPath,['server/src/server.js'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{SystemRoot:process.env.SystemRoot||'C:/Windows',NODE_ENV:'test',JWT_SECRET:key,DATABASE_PATH:databasePath,PRICEBOOK_PATH:resolve(out,'pricebooks'),DOTENV_CONFIG_PATH:resolve(out,'absent.env'),ALLOW_PROVIDER_WRITES:'false',VOICE_RUNTIME_ENABLED:'false',STRIPE_BILLING_ENABLED:'false',EMAIL_PROVIDER:'console',LOCAL_PREVIEW:'false',PORT:String(port)}});
child.stdout.on('data',v=>writeFileSync(resolve(out,'server-stdout.log'),v,{flag:'a'}));child.stderr.on('data',v=>writeFileSync(resolve(out,'server-stderr.log'),v,{flag:'a'}));
const cases=[
{id:'AK-owner-tax-is-discarded',request:{country:'US',region:'AK',taxMode:'TAX_ALL',taxPercent:'5'},expected:{taxMode:'TAX_ALL',taxPercent:5}},
{id:'NS-owner-rate-is-discarded',request:{country:'CA',region:'NS',taxMode:'TAX_ALL',taxPercent:'13'},expected:{taxMode:'TAX_ALL',taxPercent:13}},
{id:'NS-owner-no-tax-is-discarded',request:{country:'CA',region:'NS',taxMode:'TAX_NONE',taxPercent:'0'},expected:{taxMode:'TAX_NONE',taxPercent:0}},
{id:'NY-owner-tax-control',request:{country:'US',region:'NY',taxMode:'TAX_ALL',taxPercent:'8.875'},expected:{taxMode:'TAX_ALL',taxPercent:8.875}}
];
const results=[];
try{
let ready=false;for(let i=0;i<6000;i++){try{const h=await fetch(base+'/api/health');if(h.ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,50));}if(!ready)throw Error('Synthetic server did not start');
const entitlementFixture=new Database(databasePath);entitlementFixture.prepare('INSERT INTO billingAccounts(ownerId,stripeCustomerId,paymentMethodVerifiedAt,createdAt,updatedAt) VALUES(?,?,?,?,?)').run(id,'cus_synthetic_'+id.replaceAll('-',''),new Date().toISOString(),new Date().toISOString(),new Date().toISOString());entitlementFixture.prepare("UPDATE users SET plan='QuoteDone',planStatus='active',emailVerifiedAt=? WHERE id=?").run(new Date().toISOString(),id);entitlementFixture.close();
for(const c of cases){let response=await fetch(base+'/api/business/jurisdiction',{method:'POST',headers:{authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(c.request)});let body=await response.json();results.push({...c,status:response.status,actual:{taxMode:body.taxMode,taxPercent:body.taxPercent,...(body.error?{error:body.error}:{})},passed:response.status===200&&body.taxMode===c.expected.taxMode&&body.taxPercent===c.expected.taxPercent});}
writeFileSync(resolve(out,'tax-choice-results.json'),JSON.stringify({source:process.argv[4],providerWrites:false,results},null,2));console.log(JSON.stringify({completed:true,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results},null,2));process.exitCode=results.every(r=>r.passed)?0:1;
}finally{child.kill();}
