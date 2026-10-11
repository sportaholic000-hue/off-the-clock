// Local, synthetic S3 protocol fixture. No cloud SDK/account/provider is mocked.
import http from 'node:http';
import {once} from 'node:events';
const xml=text=>String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export async function fakeS3(t) {
  const objects=new Map(),versions=new Map(),requests=[],controls={failDataPuts:0,loseResponse:false,failDeletes:0,failDeleteKey:null,
    versioning:'Unsupported',versioningError:null,failVersionDeleteKey:null,ignoreVersionDeletes:false};
  let versionSequence=0;
  const versioned=()=>['Enabled','Suspended'].includes(controls.versioning);
  function addVersion(key,value){
    const versionId=controls.versioning==='Suspended'?'null':'SYNTHETIC-version-'+(++versionSequence);
    const prior=versions.get(key)||[],list=[{...value,versionId},...prior.filter(v=>v.versionId!==versionId)];versions.set(key,list);
    if(value.deleteMarker)objects.delete(key);else objects.set(key,{...value,versionId});return versionId;
  }
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://fake.invalid'),virtual=req.headers.host?.startsWith('synthetic-bucket.'),key=decodeURIComponent(url.pathname).slice(virtual?1:'/synthetic-bucket/'.length);
    requests.push({method:req.method,key,host:req.headers.host,path:url.pathname,authorization:req.headers.authorization,versionId:url.searchParams.get('versionId'),query:url.search});
    const error=(status,code)=>{res.writeHead(status,{'content-type':'application/xml'});res.end('<Error><Code>'+code+'</Code><Message>SYNTHETIC FAILURE</Message></Error>');};
    if(!req.headers.authorization?.startsWith('AWS4-HMAC-SHA256 Credential=SYNTHETIC_ACCESS/'))return error(403,'AccessDenied');
    if(url.searchParams.has('versioning')){
      if(controls.versioningError)return error(controls.versioningError.status,controls.versioningError.code);
      if(controls.versioning==='Unsupported')return error(501,'NotImplemented');
      res.setHeader('content-type','application/xml');res.end('<VersioningConfiguration>'+(controls.versioning==='NeverEnabled'?'':'<Status>'+xml(controls.versioning)+'</Status>')+'</VersioningConfiguration>');return;
    }
    if(url.searchParams.has('versions')){
      const all=[...versions].filter(([key])=>key.startsWith(url.searchParams.get('prefix')||'')).sort(([a],[b])=>a.localeCompare(b))
        .flatMap(([key,list])=>list.map((v,i)=>({...v,key,isLatest:i===0})));
      const marker=url.searchParams.get('key-marker'),id=url.searchParams.get('version-id-marker');
      const start=marker?all.findIndex(v=>v.key===marker&&v.versionId===id)+1:0,page=all.slice(start,start+3),truncated=start+3<all.length,last=page.at(-1);
      res.setHeader('content-type','application/xml');res.end('<ListVersionsResult><IsTruncated>'+truncated+'</IsTruncated>'+
        (truncated?'<NextKeyMarker>'+xml(last.key)+'</NextKeyMarker><NextVersionIdMarker>'+xml(last.versionId)+'</NextVersionIdMarker>':'')+
        page.map(v=>{const tag=v.deleteMarker?'DeleteMarker':'Version';return '<'+tag+'><Key>'+xml(v.key)+'</Key><VersionId>'+xml(v.versionId)+'</VersionId><IsLatest>'+v.isLatest+'</IsLatest></'+tag+'>';}).join('')+'</ListVersionsResult>');return;
    }
    if(url.searchParams.get('list-type')==='2') {
      const keys=[...objects.keys()].filter(k=>k.startsWith(url.searchParams.get('prefix')||'')).sort();
      const start=Number(url.searchParams.get('continuation-token')||0),page=keys.slice(start,start+11),truncated=start+11<keys.length;
      res.setHeader('content-type','application/xml');res.end('<ListBucketResult><IsTruncated>'+truncated+'</IsTruncated>'+(truncated?'<NextContinuationToken>'+(start+11)+'</NextContinuationToken>':'')+page.map(k=>'<Contents><Key>'+xml(k)+'</Key><Size>'+objects.get(k).bytes.length+'</Size></Contents>').join('')+'</ListBucketResult>');return;
    }
    if(req.method==='PUT') {
      const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
      if(key.endsWith('.enc') && controls.failDataPuts-->0)return error(503,'ServiceUnavailable');
      if(req.headers['if-none-match']==='*' && objects.has(key))return error(412,'PreconditionFailed');
      const value={bytes:body,sha256:req.headers['x-amz-meta-sha256']};
      if(versioned())res.setHeader('x-amz-version-id',addVersion(key,value));else objects.set(key,value);
      if(key.endsWith('.enc') && controls.loseResponse){controls.loseResponse=false;res.destroy();return;}
      res.setHeader('ETag','"synthetic-etag"');res.end();return;
    }
    if(req.method==='DELETE') {
      if(controls.failDeleteKey===key || controls.failDeletes-->0)return error(503,'ServiceUnavailable');
      if(url.searchParams.has('versionId')){
        if(controls.failVersionDeleteKey===key)return error(403,'AccessDenied');
        if(!controls.ignoreVersionDeletes){
          const list=(versions.get(key)||[]).filter(v=>v.versionId!==url.searchParams.get('versionId'));versions.set(key,list);
          if(list[0]&&!list[0].deleteMarker)objects.set(key,list[0]);else objects.delete(key);
        }
      }else if(versioned())addVersion(key,{deleteMarker:true});else objects.delete(key);
      res.statusCode=204;res.end();return;
    }
    const object=objects.get(key);if(!object)return error(404,'NoSuchKey');
    res.setHeader('content-length',object.bytes.length);
    if(object.sha256)res.setHeader('x-amz-meta-sha256',object.sha256);
    if(object.versionId)res.setHeader('x-amz-version-id',object.versionId);
    if(req.method==='HEAD')res.end();else res.end(object.bytes);
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  return {objects,versions,requests,controls,endpoint:'http://127.0.0.1:'+server.address().port};
}
