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
 for(const text of ['$69/month or $690/year. 150 included minutes','$119/month or $1,190/year. 300 included minutes','$279/month or $2,790/year. 1,200 included minutes','No calendar booking, live transfer, price book, website widget or phone price-book quoting.','Phone price-book quoting is not included.'])assert.ok(html.includes(text),text);
 assert.ok(!html.includes('aria-label="Scale"'));
});
