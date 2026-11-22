import {lookup as dnsLookup} from 'node:dns/promises';
import {performance} from 'node:perf_hooks';
import {boundedWebsiteLimits,websiteUrl,resolveWebsiteDestination,readWebsiteResponse,WebsiteImportError} from './websitePriceTransport.js';
import {extractWebsitePrices,websitePriceConditionIdentity} from './websitePriceExtraction.js';

export function createWebsitePriceImporter({lookup=dnsLookup,request,limits:overrides={}}={}){
  const limits=boundedWebsiteLimits(overrides);
  return async function importPrices(input){
    const start=websiteUrl(input),deadline=performance.now()+limits.totalMs;
    const budget={bytesLeft:limits.totalBytes},queue=[start.href],queued=new Set(queue),requested=new Set(),pages=[],candidates=[],websiteNotes=new Set(),entries=[],seen=new Set(),cssCache=new Map();
    let requests=0,fetchedPages=0,limited=false,visibilityUnverified=false,conditionsUnverified=false,websiteConditionsUnverified=false,chars=0;
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
        // Same-host stylesheets are read through the same bounded transport.
        // A stylesheet that is on another host, fails, or would use the
        // requests and bytes kept for the remaining pages is skipped; the
        // page's prices stay in the draft and the owner is told.
        const stylesheets=Object.create(null);
        const pagesLeft=()=>Math.min(limits.pages-fetchedPages,queue.filter(url=>!requested.has(url)).length+extracted.links.length);
        for(const href of extracted.stylesheetLinks.slice(0,limits.links)){
          let url;try{url=websiteUrl(new URL(href,page.url).href,start.hostname).href;}catch{continue;}
          if(!cssCache.has(url)){
            if(requests+pagesLeft()>=limits.requests||budget.bytesLeft-pagesLeft()*limits.pageBytes/4<limits.pageBytes/4)continue;
            try{cssCache.set(url,(await fetchPage(url,true)).text);}catch(error){
              cssCache.set(url,null);
              if(['WEBSITE_TIMEOUT','WEBSITE_REQUEST_LIMIT'].includes(error.code))break;
            }
          }
          if(typeof cssCache.get(url)==='string')stylesheets[href]=cssCache.get(url);
        }
        extracted=extractWebsitePrices(page.text,{plain:page.plain,limits,stylesheets});
      }
      pages.push(page.url);
      if(extracted.linksLimited||extracted.limited)limited=true;
      if(extracted.visibilityUnverified)visibilityUnverified=true;
      if(extracted.conditionsUnverified)conditionsUnverified=true;
      for(const note of extracted.websiteConditions||[])websiteNotes.add(note);
      if(extracted.websiteConditionsUnverified)websiteConditionsUnverified=true;
      // Finish condition discovery before deduplication or output budgets: a
      // later fetched page can qualify an earlier price, even past an entry cap.
      for(const entry of extracted.entries)candidates.push({...entry,sourceUrl:page.url});
      const links=extracted.links.map(link=>{try{return {url:websiteUrl(new URL(link.href,page.url).href,start.hostname),label:link.label};}catch{return null;}}).filter(Boolean)
        .sort((a,b)=>Number(/pric|rate|menu|service|fee|cost/i.test(b.url.pathname+' '+b.label))-Number(/pric|rate|menu|service|fee|cost/i.test(a.url.pathname+' '+a.label)));
      for(const {url}of links){
        if(queued.has(url.href)||requested.has(url.href))continue;
        if(queued.size>=limits.links){limited=true;break;}
        queued.add(url.href);queue.push(url.href);
      }
    }
    if(queue.some(url=>!requested.has(url)))limited=true;
    if(websiteConditionsUnverified){limited=true;conditionsUnverified=true;}
    const qualifiedKeys=new Set(candidates.filter(entry=>websitePriceConditionIdentity(entry).qualified).map(entry=>websitePriceConditionIdentity(entry).key));
    for(const entry of candidates){
      if(websiteConditionsUnverified)continue;
      const identity=websitePriceConditionIdentity(entry);
      // Same literal item/amount, but incompatible source qualifications: do
      // not expose the bare version as a way around the restricted paragraph.
      // Keep qualified variants verbatim; never copy one page's local note to
      // another page or guess which offer the customer is eligible to use.
      if(!identity.qualified&&qualifiedKeys.has(identity.key)){limited=true;conditionsUnverified=true;continue;}
      const conditions=[...new Set([...(entry.conditions||[]),...websiteNotes])];
      const excerpt=[entry.excerpt,...conditions.filter(note=>!entry.excerpt.includes(note))].join('\n');
      if(seen.has(excerpt))continue;
      if(entries.length>=limits.priceEntries||chars+excerpt.length+(entries.length?2:0)>limits.pricesChars){limited=true;continue;}
      chars+=excerpt.length+(entries.length?2:0);seen.add(excerpt);
      entries.push({...entry,excerpt,...(conditions.length?{conditions}:{} )});
    }
    return {prices:entries.map(e=>e.excerpt).join('\n\n'),websiteUrl:start.href,draft:true,websiteImport:{
      entries,pages,limited,visibilityUnverified,conditionsUnverified,
      message:(entries.length?'Website prices are a draft. Review the item names, amounts and conditions before saving.':'No literal prices were found in the pages read. Your saved prices have not changed.')+
        (limited?' Only part of the website could be read within the import limits.':'')+
        (visibilityUnverified?' Some of the website styling could not be checked, so a price the website hides may be included. Remove any price your customers cannot see on the website.':'')+
        (conditionsUnverified?' Manual review required: prices were omitted where their conditions could not be associated safely. Review the website and enter each price with all applicable conditions.':'')
    }};
  };
}
export const importWebsitePrices=createWebsitePriceImporter();
