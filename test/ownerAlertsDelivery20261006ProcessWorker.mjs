// Synthetic process fixture: the only provider address must be loopback.
import Database from 'better-sqlite3';
import {createVoiceSmsService} from '../server/src/voiceSmsService.js';
const [filename,endpoint,clock]=process.argv.slice(2),url=new URL(endpoint);
if(url.hostname!=='127.0.0.1')throw Error('Synthetic SMS provider must be loopback');
const db=new Database(filename);db.pragma('foreign_keys=ON');
try{
  const service=createVoiceSmsService({database:db,clock:()=>Number(clock),provider:{send:async request=>{
    const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request)});return response.json();
  }}});
  console.log(JSON.stringify(await service.dispatchOnce()));
}finally{db.close();}
