// Standalone synthetic process worker. Its only provider is a loopback fixture.
import Database from 'better-sqlite3';
import {createOwnerAlertService} from '../server/src/ownerAlertService.js';
const [filename,endpoint,clock]=process.argv.slice(2),url=new URL(endpoint);
if(url.hostname!=='127.0.0.1')throw Error('Synthetic provider must be loopback.');
const db=new Database(filename);db.pragma('foreign_keys=ON');
try{
  const w=createOwnerAlertService({database:db,environment:{EMAIL_FROM:'alerts@example.invalid'},clock:()=>Number(clock),ready:()=>true,send:async message=>{
    const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(message)});return r.json();
  }});console.log(JSON.stringify(await w.dispatchOnce()));
}finally{db.close();}
