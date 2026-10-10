import {buildUi,startHarness} from './harness.mjs';
const h=await startHarness({dist:await buildUi()});
await h.setTrial();
console.log(JSON.stringify({origin:h.origin,tokens:h.tokens}));
process.on('SIGTERM',async()=>{await h.close();process.exit(0);});
