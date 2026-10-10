// Local, synthetic S3 protocol fixture. No cloud SDK/account/provider is mocked.
import http from 'node:http';
import {once} from 'node:events';
const xml=text=>String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export async function fakeS3(t) {
  const objects=new Map(),requests=[],controls={failDataPuts:0,loseResponse:false,failDeletes:0,failDeleteKey:null};
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://fake.invalid'),virtual=req.headers.host?.startsWith('synthetic-bucket.'),key=decodeURIComponent(url.pathname).slice(virtual?1:'/synthetic-bucket/'.length);
    requests.push({method:req.method,key,host:req.headers.host,path:url.pathname,authorization:req.headers.authorization});
    const error=(status,code)=>{res.writeHead(status,{'content-type':'application/xml'});res.end('<Error><Code>'+code+'</Code><Message>SYNTHETIC FAILURE</Message></Error>');};
    if(!req.headers.authorization?.startsWith('AWS4-HMAC-SHA256 Credential=SYNTHETIC_ACCESS/'))return error(403,'AccessDenied');
    if(url.searchParams.get('list-type')==='2') {
      const keys=[...objects.keys()].filter(k=>k.startsWith(url.searchParams.get('prefix')||'')).sort();
      const start=Number(url.searchParams.get('continuation-token')||0),page=keys.slice(start,start+11),truncated=start+11<keys.length;
      res.setHeader('content-type','application/xml');res.end('<ListBucketResult><IsTruncated>'+truncated+'</IsTruncated>'+(truncated?'<NextContinuationToken>'+(start+11)+'</NextContinuationToken>':'')+page.map(k=>'<Contents><Key>'+xml(k)+'</Key><Size>'+objects.get(k).bytes.length+'</Size></Contents>').join('')+'</ListBucketResult>');return;
    }
    if(req.method==='PUT') {
      const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
      if(key.endsWith('.enc') && controls.failDataPuts-->0)return error(503,'ServiceUnavailable');
      if(req.headers['if-none-match']==='*' && objects.has(key))return error(412,'PreconditionFailed');
      objects.set(key,{bytes:body,sha256:req.headers['x-amz-meta-sha256']});
      if(key.endsWith('.enc') && controls.loseResponse){controls.loseResponse=false;res.destroy();return;}
      res.setHeader('ETag','"synthetic-etag"');res.end();return;
    }
    if(req.method==='DELETE') {
      if(controls.failDeleteKey===key || controls.failDeletes-->0)return error(503,'ServiceUnavailable');
      objects.delete(key);res.statusCode=204;res.end();return;
    }
    const object=objects.get(key);if(!object)return error(404,'NoSuchKey');
    res.setHeader('content-length',object.bytes.length);
    if(object.sha256)res.setHeader('x-amz-meta-sha256',object.sha256);
    if(req.method==='HEAD')res.end();else res.end(object.bytes);
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  return {objects,requests,controls,endpoint:'http://127.0.0.1:'+server.address().port};
}
