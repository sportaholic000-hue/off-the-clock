import {Worker} from 'node:worker_threads';

const failure=(code,message,cause)=>Object.assign(new Error(message),{code,...(cause?{cause}:{})});

// Each task receives a fresh worker. That makes abort and timeout definitive:
// terminating the worker stops its CPU work. Concurrency and queued work stay
// bounded, and completed reports leave no idle worker or tenant data resident.
export class OwnerReportWorkerPool {
  constructor({size=1,maxQueue=4,timeoutMs=60_000,workerUrl=new URL('./ownerReportWorker.js',import.meta.url)}={}){
    if(!Number.isSafeInteger(size)||size<1||size>8)throw new TypeError('Owner report worker count must be between 1 and 8.');
    if(!Number.isSafeInteger(maxQueue)||maxQueue<0||maxQueue>100)throw new TypeError('Owner report queue limit must be between 0 and 100.');
    if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1)throw new TypeError('Owner report timeout must be positive.');
    this.size=size;this.maxQueue=maxQueue;this.timeoutMs=timeoutMs;this.workerUrl=workerUrl;
    this.queue=[];this.active=new Map();this.nextTaskId=1;this.closed=false;
  }
  stats(){return {size:this.size,maxQueue:this.maxQueue,active:this.active.size,queued:this.queue.length,closed:this.closed};}
  run(payload,{signal}={}){
    if(this.closed)return Promise.reject(failure('OWNER_REPORT_POOL_CLOSED','Owner report worker pool is closed.'));
    if(signal?.aborted)return Promise.reject(failure('OWNER_REPORT_ABORTED','Owner report calculation was cancelled.'));
    if(this.active.size>=this.size&&this.queue.length>=this.maxQueue)return Promise.reject(failure('OWNER_REPORT_OVERLOADED','Owner report workers are busy.'));
    return new Promise((resolve,reject)=>{
      const task={id:this.nextTaskId++,payload,signal,resolve,reject,worker:null,settled:false,timer:null,abort:null};
      task.abort=()=>this.#settle(task,failure('OWNER_REPORT_ABORTED','Owner report calculation was cancelled.'));
      signal?.addEventListener('abort',task.abort,{once:true});
      task.timer=setTimeout(()=>this.#settle(task,failure('OWNER_REPORT_TIMEOUT','Owner report calculation timed out.')),this.timeoutMs);
      this.queue.push(task);this.#drain();
    });
  }
  #drain(){
    if(this.closed)return;
    while(this.active.size<this.size&&this.queue.length){
      const task=this.queue.shift();
      if(task.settled)continue;
      let worker;
      try{worker=new Worker(this.workerUrl);}catch(error){this.#settle(task,failure('OWNER_REPORT_WORKER_FAILED','Owner report worker could not start.',error));continue;}
      task.worker=worker;this.active.set(task.id,task);
      worker.once('message',message=>{
        if(message?.taskId!==task.id)return this.#settle(task,failure('OWNER_REPORT_WORKER_FAILED','Owner report worker returned an invalid response.'));
        if(!message.ok)return this.#settle(task,failure('OWNER_REPORT_CALCULATION_FAILED','Owner report calculation failed.',message.error));
        this.#settle(task,null,message.result);
      });
      worker.once('error',error=>this.#settle(task,failure('OWNER_REPORT_WORKER_FAILED','Owner report worker failed.',error)));
      worker.once('exit',code=>{if(!task.settled)this.#settle(task,failure('OWNER_REPORT_WORKER_FAILED',`Owner report worker exited before completion (${code}).`));});
      try{worker.postMessage({taskId:task.id,payload:task.payload});}
      catch(error){this.#settle(task,failure('OWNER_REPORT_WORKER_FAILED','Owner report input could not be transferred.',error));}
    }
  }
  #settle(task,error,result){
    if(task.settled)return;
    task.settled=true;clearTimeout(task.timer);task.signal?.removeEventListener('abort',task.abort);
    const queued=this.queue.indexOf(task);if(queued!==-1)this.queue.splice(queued,1);
    if(task.worker){
      this.active.delete(task.id);
      const worker=task.worker;task.worker=null;worker.removeAllListeners();
      void worker.terminate().catch(()=>{});
    }
    if(error)task.reject(error);else task.resolve(result);
    queueMicrotask(()=>this.#drain());
  }
  async close(){
    if(this.closed)return;
    this.closed=true;
    const queued=[...this.queue],active=[...this.active.values()];
    for(const task of queued)this.#settle(task,failure('OWNER_REPORT_POOL_CLOSED','Owner report worker pool is closed.'));
    const workers=active.map(task=>task.worker).filter(Boolean);
    for(const task of active)this.#settle(task,failure('OWNER_REPORT_POOL_CLOSED','Owner report worker pool is closed.'));
    await Promise.allSettled(workers.map(worker=>worker.terminate()));
  }
}

let sharedPool;
export function runOwnerReport(payload,options){
  if(!sharedPool)sharedPool=new OwnerReportWorkerPool();
  return sharedPool.run(payload,options);
}
export async function closeOwnerReportWorkerPool(){
  const pool=sharedPool;sharedPool=undefined;
  await pool?.close();
}
