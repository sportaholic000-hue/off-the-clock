import http from 'node:http';
import https from 'node:https';
import {lookup as dnsLookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {gunzipSync, inflateSync, brotliDecompressSync} from 'node:zlib';
import ipaddr from 'ipaddr.js';

export const WEBSITE_LIMITS=Object.freeze({pages:6,requests:12,redirects:3,pageBytes:262144,totalBytes:1048576,requestMs:4000,dnsMs:2000,totalMs:12000,nodes:20000,depth:128,pricesChars:20000,priceEntries:100,links:100});
export class WebsiteImportError extends Error {
  constructor(code,message,statusCode=422){super(message);this.code=code;this.statusCode=statusCode;}
}
const blocked=()=>new WebsiteImportError('WEBSITE_ADDRESS_BLOCKED','Use a public business website on HTTP or HTTPS, without sign-in details or a custom port.',400);
const timedOut=()=>new WebsiteImportError('WEBSITE_TIMEOUT','The website took too long to respond. Try again or enter your prices manually.');
export function publicWebsiteAddress(address){
  if(!isIP(address)||address.includes('%'))return false;
  const parsed=ipaddr.parse(address);
  // Allow only ordinary public unicast; never IPv4-mapped, transition,
  // documentation, benchmarking, multicast, link-local, reserved or private ranges.
  if(parsed.kind()==='ipv4'&&parsed.match(ipaddr.parse('198.18.0.0'),15))return false;
  return parsed.range()==='unicast' && (parsed.kind()==='ipv4'||parsed.match(ipaddr.parse('2000::'),3));
}
export function websiteUrl(input,host){
  if(typeof input!=='string'||input.length>2048||/[\u0000-\u0020\u007f\\]/u.test(input))throw blocked();
  let url;try{url=new URL(input);}catch{throw blocked();}
  const name=url.hostname.replace(/^\[|\]$/g,'').toLowerCase();
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.port||!name||
    name.endsWith('.')||(!isIP(name)&&(!name.includes('.')||/(?:^|\.)(?:localhost|local|internal|lan|home|corp|arpa|onion)$/.test(name)))||
    (host&&url.hostname!==host)||(isIP(name)&&!publicWebsiteAddress(name)))throw blocked();
  url.hash='';return url;
}
export function boundedWebsiteLimits(overrides={}){
  const out={...WEBSITE_LIMITS};
  for(const [key,value]of Object.entries(overrides)){
    if(!(key in out)||!Number.isInteger(value)||value<1||value>out[key])throw new TypeError('Website limits can only be reduced.');
    out[key]=value;
  }
  return out;
}
export async function resolveWebsiteDestination(url,{lookup=dnsLookup,timeoutMs=2000}={}){
  const hostname=url.hostname.replace(/^\[|\]$/g,'');let timer;
  try{
    const records=isIP(hostname)?[{address:hostname,family:isIP(hostname)}]:await Promise.race([
      lookup(hostname,{all:true,verbatim:true}),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(timedOut()),timeoutMs);})
    ]);
    if(!Array.isArray(records)||!records.length||records.some(r=>!publicWebsiteAddress(r.address)||isIP(r.address)!==r.family))throw blocked();
    return {url,hostname,address:records[0].address,family:records[0].family};
  }catch(error){
    if(error instanceof WebsiteImportError)throw error;
    throw new WebsiteImportError('WEBSITE_DNS_FAILED','The public website address could not be resolved. Check the address and try again.');
  }finally{clearTimeout(timer);}
}

// The request adapter is injectable only by trusted server code/tests. No
// request payload or environment switch can enable access to private addresses.
export function readWebsiteResponse(destination,{limits,budget,timeoutMs,request,stylesheet=false}={}){
  return new Promise((resolve,reject)=>{
    let req,res,settled=false;const chunks=[];let bytes=0;
    const finish=(error,value)=>{
      if(settled)return;settled=true;clearTimeout(timer);
      if(error){res?.destroy();req?.destroy();reject(error);}else resolve(value);
    };
    const timer=setTimeout(()=>finish(timedOut()),timeoutMs);
    try{
      const send=request||(destination.url.protocol==='https:'?https.request:http.request);
      req=send(destination.url,{
        method:'GET',agent:false,maxHeaderSize:16384,
        servername:isIP(destination.hostname)?undefined:destination.hostname,
        lookup:(_host,options,callback)=>options?.all
          ?callback(null,[{address:destination.address,family:destination.family}])
          :callback(null,destination.address,destination.family),
        headers:{Accept:stylesheet?'text/css':'text/html, text/plain;q=0.8','Accept-Encoding':'identity','User-Agent':'OffTheClock-OwnerPriceDraft/1'}
      },response=>{
        res=response;res.on('error',()=>finish(new WebsiteImportError('WEBSITE_READ_FAILED','The website response could not be read.')));
        const status=res.statusCode;
        if([301,302,303,307,308].includes(status)){
          const location=res.headers.location;res.destroy();finish(null,{status,location});return;
        }
        if(status!==200){res.destroy();finish(new WebsiteImportError('WEBSITE_HTTP_FAILED','The website did not return a public page.'));return;}
        const contentType=String(res.headers['content-type']||'');
        if(!(stylesheet?/^text\/css(?:\s*;|$)/i:/^(?:text\/(?:html|plain)|application\/xhtml\+xml)(?:\s*;|$)/i).test(contentType)){
          res.destroy();finish(new WebsiteImportError('WEBSITE_CONTENT_TYPE','Only readable HTML or text pages can be imported.'));return;
        }
        const tooLarge=()=>new WebsiteImportError('WEBSITE_SIZE_LIMIT','The website page exceeds the import size limit. Enter these prices manually.');
        const declared=res.headers['content-length'];
        if(declared&&(!/^\d+$/.test(declared)||Number(declared)>limits.pageBytes||Number(declared)>budget.bytesLeft)){finish(tooLarge());return;}
        res.on('data',chunk=>{
          if(settled)return;
          bytes+=chunk.length;budget.bytesLeft-=chunk.length;
          if(bytes>limits.pageBytes||budget.bytesLeft<0){finish(tooLarge());return;}chunks.push(chunk);
        });
        res.on('aborted',()=>finish(new WebsiteImportError('WEBSITE_READ_FAILED','The website response ended before the complete page arrived.')));
        res.on('end',()=>{
          if(settled)return;
          try{
            let body=Buffer.concat(chunks);const encoding=String(res.headers['content-encoding']||'identity').toLowerCase();
            const decompress={gzip:gunzipSync,deflate:inflateSync,br:brotliDecompressSync}[encoding];
            if(encoding!=='identity'){
              if(!decompress)throw new WebsiteImportError('WEBSITE_ENCODING','This website uses an unsupported page encoding.');
              try{body=decompress(body,{maxOutputLength:limits.pageBytes});}catch{throw tooLarge();}
              budget.bytesLeft-=body.length;if(budget.bytesLeft<0)throw tooLarge();
            }
            const meta=body.subarray(0,1024).toString('latin1').match(/<meta\b[^>]*charset\s*=\s*["']?([\w-]+)/i);
            const charset=contentType.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]||meta?.[1]||'utf-8';
            let text;try{text=new TextDecoder(charset,{fatal:true}).decode(body);}catch{throw new WebsiteImportError('WEBSITE_ENCODING','The website text could not be decoded without changing characters.');}
            finish(null,{status,text,plain:/^text\/plain/i.test(contentType)});
          }catch(error){finish(error);}
        });
      });
      req.on('error',()=>finish(new WebsiteImportError('WEBSITE_CONNECTION_FAILED','The public website could not be reached. Try again or enter prices manually.')));
      req.end();
    }catch(error){finish(error instanceof WebsiteImportError?error:new WebsiteImportError('WEBSITE_CONNECTION_FAILED','The public website could not be reached.'));}
  });
}
