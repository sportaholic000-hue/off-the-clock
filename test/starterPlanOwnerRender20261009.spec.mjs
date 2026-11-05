import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
test('Starter lineup: real signup renders three plan choices with exact prices, minutes and exclusions',async t=>{
 const priorWindow=globalThis.window,priorStorage=globalThis.localStorage;
 globalThis.window={location:{pathname:'/onboarding',search:''}};globalThis.localStorage={getItem:()=>null};
 t.after(()=>{globalThis.window=priorWindow;globalThis.localStorage=priorStorage;});
 const vite=await createServer({root:process.cwd()+'/client',server:{middlewareMode:true},appType:'custom'});t.after(()=>vite.close());
 const {default:Onboarding}=await vite.ssrLoadModule('/src/onboarding.jsx'),html=renderToStaticMarkup(React.createElement(Onboarding));
 for(const name of ['Starter','Operator','QuoteDone'])assert.ok(html.includes('aria-label="'+name+'"'),name);
 // Each card shows the monthly price, the yearly price and the monthly minutes, matching billingUsagePolicy.js.
 for(const text of ['$69<small>/mo</small>','or $690/year · 150 minutes a month','$119<small>/mo</small>','or $1,190/year · 300 minutes a month','$279<small>/mo</small>','or $2,790/year · 1,200 minutes a month','No calendar booking, live transfer, price book, website widget or phone price-book quoting.','Phone price-book quoting is not included.','Price-book quoting on the phone'])assert.ok(html.includes(text),text);
 // Name and price sit in separate elements of the card head.
 for(const name of ['Starter','Operator','QuoteDone'])assert.ok(html.includes('<span class="plan-card-name">'+name+'</span><span class="plan-card-price">'),name);
 assert.ok(!html.includes('aria-label="Scale"'));
});
