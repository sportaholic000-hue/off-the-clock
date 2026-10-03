// Serves the built owner app and pipes /api to the real API server (same-origin for cookies).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const dist=process.env.OTC_DIST, api={host:'127.0.0.1',port:3201};
http.createServer((req,res)=>{
  if(req.url.startsWith('/api/')){
    const p=http.request({...api,method:req.method,path:req.url,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
    p.on('error',e=>{res.writeHead(502);res.end(String(e));});req.pipe(p);return;
  }
  let file=path.join(dist,decodeURIComponent(req.url.split('?')[0]));
  if(!file.startsWith(dist)||!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(dist,'index.html');
  const type={'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream';
  res.writeHead(200,{'content-type':type});fs.createReadStream(file).pipe(res);
}).listen(4173,()=>console.log('proxy listening'));
