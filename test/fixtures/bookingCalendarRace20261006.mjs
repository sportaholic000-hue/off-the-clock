import {parentPort,workerData} from 'node:worker_threads';
import Database from 'better-sqlite3';
import {createBookingService} from '../../server/src/bookingService.js';
import {SECRET} from './bookingCalendar20261006.mjs';
const db=new Database(workerData.path,{timeout:5000});db.pragma('foreign_keys = ON');
const booking=createBookingService({db,clock:()=>new Date(workerData.now),slotTokenSecret:SECRET,calendar:{listBusy:async()=>[],createEvent:async()=>{throw Error('No provider writes in hold worker');}}});
parentPort.postMessage({ready:true});Atomics.wait(new Int32Array(workerData.barrier),0,0,10000);
try{parentPort.postMessage({ok:true,result:booking.hold(workerData.request)});}catch(e){parentPort.postMessage({ok:false,code:e.code,message:e.message});}finally{db.close();}
