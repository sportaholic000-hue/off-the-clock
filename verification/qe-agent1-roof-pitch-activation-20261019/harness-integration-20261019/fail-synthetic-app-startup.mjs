// Negative control only: make the real child application fail to start.
// The audit parent runs normally and must report a genuine execution failure.
if(process.argv[1]?.replaceAll('\\','/').endsWith('/server/src/server.js'))throw Error('[SYNTHETIC] deliberate application startup failure for harness propagation control');
