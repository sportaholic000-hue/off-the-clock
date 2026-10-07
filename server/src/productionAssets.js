import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

const ownerPaths = new Set(['/','/signup','/register','/login','/onboarding','/dashboard','/calls','/reports','/calendar','/pricebook','/leads','/quotes','/settings','/settings/billing','/admin','/forgot-password','/reset-password','/verify-email','/resend-verification','/account/email']);

export function installWidgetAssets(app, dist) {
  // Public module scripts must load on an owner's website, before tenant API
  // CORS runs. These files contain no tenant data or authenticated responses.
  for (const name of ['widget.js','widget-app.js']) app.get('/'+name,(req,res,next)=>{
    res.set('Access-Control-Allow-Origin','*').set('Cache-Control','public, max-age=300');
    res.sendFile(path.join(dist,name),error=>{if(error)next(error);});
  });
}
export function installOwnerAssets(app, dist) {
  if(!fs.existsSync(path.join(dist,'index.html'))) throw new Error('Owner app build is missing.');
  app.use('/assets',express.static(path.join(dist,'assets'),{dotfiles:'deny',index:false,fallthrough:false,maxAge:'1y',immutable:true}));
  app.get('*',(req,res,next)=>{
    if(!ownerPaths.has(req.path) && !/^\/quote\/[A-Za-z0-9_-]+$/.test(req.path)) return next();
    res.set('Cache-Control','no-store');
    res.sendFile(path.join(dist,'index.html'),error=>{if(error)next(error);});
  });
  app.use((_req,res)=>res.status(404).json({error:'Not found'}));
}
