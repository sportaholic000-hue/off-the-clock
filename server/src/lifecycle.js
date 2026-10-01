// Track returned route promises as well as HTTP sockets. A disconnected client
// must not cause shutdown to close SQLite while its handler is still running.
export function createLifecycle(app, database) {
  let draining = false, server, shutdownPromise;
  const pending = new Set(), stops = [];
  function observe(result, next) {
    if (!result || typeof result.then !== 'function') return result;
    const task = Promise.resolve(result);
    pending.add(task);
    task.then(()=>pending.delete(task), error=>{pending.delete(task);next(error);});
    return result;
  }
  function wrap(handler) {
    if (handler.length === 4) return function(error,req,res,next) {return observe(handler(error,req,res,next),next);};
    return function(req,res,next) {return observe(handler(req,res,next),next);};
  }
  const mapped = value => Array.isArray(value) ? value.map(mapped) : typeof value === 'function' ? wrap(value) : value;
  for (const method of ['get','post','put','patch','delete','options','head','all','use']) {
    const original = app[method];
    app[method] = function(...args) {
      if (method === 'get' && args.length === 1) return original.apply(this,args);
      return original.apply(this,args.map(mapped));
    };
  }
  app.use((req,res,next)=>{
    res.once('finish',()=>{if(draining)setImmediate(()=>server?.closeIdleConnections?.());});
    if (!draining) return next();
    res.set('Connection','close').status(503).json({ok:false,error:'SERVICE_DRAINING'});
  });
  function health(_req,res) {
    res.set('Cache-Control','no-store');
    try {
      if (draining || database.open === false) throw new Error('not ready');
      database.prepare('SELECT 1 AS ready').get();
      res.json({ok:true});
    } catch {res.status(503).json({ok:false,error:'SERVICE_NOT_READY'});}
  }
  async function settleRoutes() {
    while(pending.size) await Promise.allSettled([...pending]);
  }
  function shutdown({timeoutMs = 110000, exit = code=>process.exit(code)} = {}) {
    if (shutdownPromise) return shutdownPromise;
    draining = true;
    shutdownPromise = (async()=>{
      let deadline;
      const timeout = new Promise((_,reject)=>{deadline=setTimeout(()=>reject(new Error('SHUTDOWN_TIMEOUT')),timeoutMs);});
      try {
        const httpDone = new Promise((resolve,reject)=>{
          if(!server) return resolve();
          server.close(error=>error ? reject(error) : resolve());
          server.closeIdleConnections?.();
        });
        await Promise.race([
          Promise.all([httpDone,...stops.map(stop=>Promise.resolve().then(stop))]).then(settleRoutes),
          timeout
        ]);
        database.close();
        clearTimeout(deadline);
        console.log('[shutdown] requests and workers drained; database closed');
        exit(0);
      } catch {
        clearTimeout(deadline);
        server?.closeAllConnections?.();
        // Never close the database underneath unfinished async work. SQLite
        // recovers its journal and durable webhook leases on the next start.
        console.error('[shutdown] deadline or drain failure; exiting for recovery');
        exit(1);
      }
    })();
    return shutdownPromise;
  }
  function attach(httpServer,{stopWorkers=[],timeoutMs=110000,signals=true}={}) {
    server=httpServer;stops.push(...stopWorkers);
    if(signals) for(const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>{void shutdown({timeoutMs});});
  }
  return {health,attach,shutdown,isDraining:()=>draining};
}
