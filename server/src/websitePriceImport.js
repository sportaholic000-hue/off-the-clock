import {lookup as dnsLookup} from 'node:dns/promises';
import {performance} from 'node:perf_hooks';
import {boundedWebsiteLimits,websiteUrl,resolveWebsiteDestination,readWebsiteResponse,WebsiteImportError} from './websitePriceTransport.js';
import {extractWebsitePrices} from './websitePriceExtraction.js';

export function createWebsitePriceImporter({lookup=dnsLookup,request,limits:overrides={}}={}){
  const limits=boundedWebsiteLimits(overrides);
  return async function importPrices(input){
    const start=websiteUrl(input),deadline=performance.now()+limits.totalMs;
    const budget={bytesLeft:limits.totalBytes},queue=[start.href],queued=new Set(queue),requested=new Set(),pages=[],entries=[],seen=new Set(),cssCache=new Map();
    let requests=0,fetchedPages=0,limited=false,visibilityUnverified=false,chars=0;
    const remaining=()=>{const ms=deadline-performance.now();if(ms<=0)throw new WebsiteImportError('WEBSITE_TIMEOUT','The website import reached its time limit.');return Math.max(1,Math.floor(ms));};
    async function fetchPage(input,stylesheet=false){
      let url=websiteUrl(input,start.hostname);
      for(let redirects=0;;redirects++){
        if(requests>=limits.requests)throw new WebsiteImportError('WEBSITE_REQUEST_LIMIT','The website import reached its request limit.');
        if(requested.has(url.href))throw new WebsiteImportError('WEBSITE_REDIRECT_LOOP','The website links or redirects repeat the same page.');
        requested.add(url.href);requests++;
        const destination=await resolveWebsiteDestination(url,{lookup,timeoutMs:Math.min(limits.dnsMs,remaining())});
        const response=await readWebsiteResponse(destination,{limits,budget,timeoutMs:Math.min(limits.requestMs,remaining()),request,stylesheet});
        remaining();
        if(response.status===200)return {...response,url:url.href};
        if(redirects>=limits.redirects)throw new WebsiteImportError('WEBSITE_REDIRECT_LIMIT','The website redirects too many times.');
        let next;try{next=new URL(response.location,url);}catch{throw new WebsiteImportError('WEBSITE_REDIRECT_INVALID','The website returned an invalid redirect.');}
        if(!response.location)throw new WebsiteImportError('WEBSITE_REDIRECT_INVALID','The website returned an invalid redirect.');
        url=websiteUrl(next.href,start.hostname);
      }
    }
    while(queue.length&&fetchedPages<limits.pages){
      const target=queue.shift();if(requested.has(target))continue;
      let page;
      try{page=await fetchPage(target);}catch(error){
        if(!pages.length)throw error;
        limited=true;
        if(['WEBSITE_TIMEOUT','WEBSITE_SIZE_LIMIT','WEBSITE_REQUEST_LIMIT'].includes(error.code))break;
        continue;
      }
      fetchedPages++;
      let extracted;
      try{extracted=extractWebsitePrices(page.text,{plain:page.plain,limits});remaining();}catch(error){if(!pages.length)throw error;limited=true;continue;}
      if(extracted.stylesheetLinks?.length){
        const stylesheets=Object.create(null);
        try{
          if(extracted.stylesheetLinks.length>limits.links)throw new WebsiteImportError('WEBSITE_STRUCTURE_LIMIT','Too many stylesheets.');
          for(const href of extracted.stylesheetLinks){
            const url=websiteUrl(new URL(href,page.url).href,start.hostname).href;
            if(!cssCache.has(url))cssCache.set(url,(await fetchPage(url,true)).text);
            stylesheets[href]=cssCache.get(url);
          }
          extracted=extractWebsitePrices(page.text,{plain:page.plain,limits,stylesheets});remaining();
        }catch{ /* Keep the incomplete, empty extraction when visibility cannot be established. */ }
      }
      pages.push(page.url);
      if(extracted.linksLimited||extracted.limited)limited=true;
      if(extracted.visibilityUnverified)visibilityUnverified=true;
      for(const entry of extracted.entries){
        const conditions=extracted.conditions.filter(note=>!entry.excerpt.includes(note));
        const excerpt=[entry.excerpt,...conditions].join('\n');
        if(seen.has(excerpt))continue;
        if(entries.length>=limits.priceEntries||chars+excerpt.length+(entries.length?2:0)>limits.pricesChars){limited=true;continue;}
        chars+=excerpt.length+(entries.length?2:0);seen.add(excerpt);entries.push({...entry,excerpt,sourceUrl:page.url});
      }
      const links=extracted.links.map(link=>{try{return {url:websiteUrl(new URL(link.href,page.url).href,start.hostname),label:link.label};}catch{return null;}}).filter(Boolean)
        .sort((a,b)=>Number(/pric|rate|menu|service|fee|cost/i.test(b.url.pathname+' '+b.label))-Number(/pric|rate|menu|service|fee|cost/i.test(a.url.pathname+' '+a.label)));
      for(const {url}of links){
        if(queued.has(url.href)||requested.has(url.href))continue;
        if(queued.size>=limits.links){limited=true;break;}
        queued.add(url.href);queue.push(url.href);
      }
    }
    if(queue.some(url=>!requested.has(url)))limited=true;
    return {prices:entries.map(e=>e.excerpt).join('\n\n'),websiteUrl:start.href,draft:true,websiteImport:{
      entries,pages,limited,visibilityUnverified,
      message:(entries.length?'Website prices are a draft. Review the item names, amounts and conditions before saving.':'No literal prices were found in the pages read. Your saved prices have not changed.')+
        (limited?' Only part of the website could be read within the import limits.':'')+
        (visibilityUnverified?' Prices were omitted where stylesheet visibility could not be verified. Review the visible website and enter those prices manually.':'')
    }};
  };
}
export const importWebsitePrices=createWebsitePriceImporter();
