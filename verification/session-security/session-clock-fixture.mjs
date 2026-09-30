import assert from 'node:assert/strict';
import fs from 'node:fs';
// This clock exists only in an isolated synthetic server process.
assert.equal(process.env.NODE_ENV,'test');
const state=JSON.parse(fs.readFileSync(process.env.AUTH_SESSION_CLOCK_FIXTURE,'utf8'));
assert.equal(state.syntheticOnly,true);
assert.ok(Number.isSafeInteger(state.now));
const NativeDate=Date;
globalThis.Date=class extends NativeDate {
 constructor(...args){super(...(args.length?args:[state.now]));}
 static now(){return state.now;}
};
