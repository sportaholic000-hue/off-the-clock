import {Parser} from 'htmlparser2';
import {WebsiteImportError,WEBSITE_LIMITS} from './websitePriceTransport.js';
import {applyWebsiteVisibility} from './websitePriceVisibility.js';

const BLOCK=new Set('address article aside blockquote br dd div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr li main nav ol p pre section table tbody td th thead tr ul'.split(' '));
const OMIT=new Set('script style template noscript iframe object embed svg math canvas head form textarea del s strike'.split(' '));
const RECORD=new Set(['body','main','li','tr','article','section','div','p','dd','dt','pre']);
const number='(?:\\d{1,3}(?:[ \\u00a0]\\d{3})+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)*|[.,]\\d+)';
const moneyPattern=new RegExp('(?:\\b(?:CA|US|AU|NZ|HK)|[CA])?[$€£¥]\\s*'+number+'|\\b(?:CAD|USD|EUR|GBP|AUD|NZD)\\s*'+number+'|\\b'+number+'\\s*(?:(?:CAD|USD|EUR|GBP|AUD|NZD|dollars?|cents?)\\b|¢)','gi');
// This is a conservative exclusion, not an instruction interpreter. Website
// text is never sent to a model; the only output is visible literal excerpts.
const instruction=/(?:ignore|disregard|override|forget)\b.{0,80}\b(?:instructions?|prompts?|rules?|previous|above)|\b(?:system|developer|assistant)\s*(?:message|prompt|instructions?|:)|\b(?:reveal|exfiltrate)\b|\b(?:you are|act as)\b.{0,60}\b(?:assistant|chatgpt|receptionist|agent)\b|\b(?:tell|instruct)\s+(?:the\s+)?(?:assistant|model|agent)\b/i;
// A qualification need not contain a number: "Minimum booking: two hours"
// changes whether a listed unit rate may be used just as much as a dollar fee.
const conditions=/%|\b(?:prices?|pricing|costs?|rates?|minimums?|min|max|maximums?|bookings?|tax(?:es)?|HST|GST|VAT|surcharges?|fees?|discounts?|deposits?|charges?|extra|additional|excluded?|excluding|included?|including|subject to|only|except|conditions?|restrictions?|required|requirements?|starting|up to|about|around|approx(?:imately)?|sale|special|promo(?:tion)?|deal|free|billed separately|charged separately|terms apply)\b/i;
const standaloneCharge=/^(?:an?\s+)?(?:all prices\b|prices\b|rates\b|minimum\b|min\b|maximum\b|max\b|booking\b|tax\b|taxes\b|HST\b|GST\b|VAT\b|surcharge\b|surcharges\b|fees?\b|discount\b|deposit\b|extra\b|additional\b)|\b(?:minimum|maximum|surcharges?|fees?|tax(?:es)?|deposits?|discounts?)\b|\b(?:a|an|we)\s+charge\b/i;
const pageWide=/\b(?:all (?:prices|rates|services|bookings|visits|items)|every (?:visit|booking|service|order)|site[- ]wide)\b/i;
const unclearReference=/\b(?:some|selected|certain|specific|applicable)\s+(?:services?|items?|prices?|offers?|bookings?)\b|\b(?:above|below|following|marked|asterisk)\b|[*†‡]/i;
const SCOPE=new Set(['root','body','main','section','article','div','li','tr','table','aside','header','footer']);
const SECTION=new Set(['section','article','li','tr','aside']);
const amounts=text=>[...text.matchAll(moneyPattern)].map(m=>m[0].trimEnd());
const normalize=text=>text.replace(/[\t\r\f ]+/g,' ').split('\n').map(s=>s.trim()).filter(Boolean).join('\n');
const qualification=text=>conditions.test(text)&&(!amounts(text).length||pageWide.test(text)||/\b(?:minimums?|maximums?|surcharges?)\b/i.test(text)||standaloneCharge.test(text.slice(0,text.search(moneyPattern))));
const within=(node,ancestor)=>{for(let n=node;n;n=n.parent)if(n===ancestor)return true;return false;};
function finishConditions(candidates,notes,associate){
  const attached=new Map(candidates.map(entry=>[entry,[]])),withheld=new Set(),savedNotes=new Set();
  for(const note of notes){
    const affected=associate(note);
    // A wrapping excerpt can already contain a note while its separately
    // extracted child listings still need it. Deduplicate only after binding.
    if(affected?.length&&affected.every(entry=>entry.excerpt.includes(note.text)))continue;
    if(!affected||unclearReference.test(note.text)||note.text.length>500){
      for(const entry of affected||candidates)withheld.add(entry);
      continue;
    }
    if(!affected.length)continue;
    savedNotes.add(note.text);
    for(const entry of affected)if(!entry.excerpt.includes(note.text))attached.get(entry).push(note.text);
  }
  const entries=candidates.filter(entry=>!withheld.has(entry)).map(candidate=>{
    const {node,...entry}=candidate,notes=[...new Set(attached.get(candidate))];
    return notes.length?{...entry,conditions:notes}:entry;
  });
  return {entries:[...new Map(entries.map(entry=>[JSON.stringify(entry),entry])).values()],conditions:[...savedNotes],conditionsUnverified:withheld.size>0};
}
function hiddenStyle(style=''){
  return style.split(';').some(declaration=>{
    const colon=declaration.indexOf(':');if(colon<0)return false;
    const property=declaration.slice(0,colon).trim().toLowerCase(),value=declaration.slice(colon+1).trim().toLowerCase();
    return property==='display'&&/^none(?:\s|!|$)/.test(value)||property==='visibility'&&/^hidden(?:\s|!|$)/.test(value)||
      ['text-decoration','text-decoration-line'].includes(property)&&value.includes('line-through');
  });
}
function itemNamed(text){
  const other=text.replace(moneyPattern,'').replace(/\b(?:from|starting|at|only|each|per|hour|hr|visit|month|year|day|week|sqft|square|foot|feet|tax|extra|plus|including|excluding|to|and|or)\b/gi,'');
  return /[\p{L}]{2}/u.test(other);
}
export function extractWebsitePrices(text,{plain=false,limits=WEBSITE_LIMITS,stylesheets={}}={}){
  if(Buffer.byteLength(text)>limits.pageBytes)throw new WebsiteImportError('WEBSITE_SIZE_LIMIT','The decoded website page exceeds the import size limit.');
  if(plain){
    const lines=text.split(/\r?\n/).map(normalize),entries=[],notes=[];let limited=false;
    for(let i=0;i<lines.length;i++)if(qualification(lines[i])&&!instruction.test(lines[i]))notes.push({text:lines[i],node:{index:i}});
    for(let i=0;i<lines.length;i++){
      const line=lines[i];
      if(!amounts(line).length||!itemNamed(line)||instruction.test(line)||qualification(line))continue;
      const start=i;
      const parts=[line];
      while(i+1<lines.length&&lines[i+1]&&!amounts(lines[i+1]).length&&!instruction.test(lines[i+1]))parts.push(lines[++i]);
      const excerpt=parts.join('\n');
      if(excerpt.length>1500){limited=true;continue;}
      entries.push({excerpt,amounts:amounts(excerpt),node:{index:start,end:i}});
    }
    const result=finishConditions(entries,notes,note=>{
      // Without markup, an unlabelled qualification before the first price is
      // page-wide. A detached note elsewhere has no reliable section binding.
      const first=entries[0]?.node.index;
      if(pageWide.test(note.text))return entries;
      if(first!==undefined&&note.node.index<first&&lines.slice(0,note.node.index).every(line=>!line||qualification(line)))return entries;
      let start=note.node.index,end=start;
      while(start>0&&lines[start-1])start--;
      while(end+1<lines.length&&lines[end+1])end++;
      const affected=entries.filter(entry=>entry.node.index>=start&&entry.node.index<=end);
      if(affected.length===1)return affected;
      return null;
    });
    return {...result,limited:limited||result.conditionsUnverified,links:[]};
  }
  const root={name:'root',parts:[],parent:null,hidden:false};const stack=[root],nodes=[],links=[];
  const parser=new Parser({
    onopentag(name,attrs){
      if(nodes.length>=limits.nodes||stack.length>=limits.depth)throw new WebsiteImportError('WEBSITE_STRUCTURE_LIMIT','The website page is too complex to import safely.');
      const parent=stack.at(-1),hidden=parent.hidden||OMIT.has(name)||Object.hasOwn(attrs,'hidden')||attrs['aria-hidden']?.toLowerCase()==='true'||hiddenStyle(attrs.style);
      const node={name,attrs,parts:[],parent,hidden,index:nodes.length};parent.parts.push(node);nodes.push(node);stack.push(node);
    },
    ontext(value){if(!stack.at(-1).hidden||stack.at(-1).name==='style')stack.at(-1).parts.push(value);},
    onclosetag(){if(stack.length>1)stack.pop();}
  },{decodeEntities:true});
  parser.end(text);
  const visibility=applyWebsiteVisibility(nodes,{stylesheets});
  if(!visibility.verified)return {entries:[],links:[],conditions:[],limited:true,visibilityUnverified:true,stylesheetLinks:visibility.stylesheetLinks};
  function content(node){
    if(node.text!==undefined)return node.text;
    if(node.hidden)return node.text='';
    return node.text=normalize(node.parts.map(part=>typeof part==='string'?part:(BLOCK.has(part.name)?'\n':'')+content(part)+(BLOCK.has(part.name)?'\n':'')).join(''));
  }
  content(root);
  let linksLimited=false;
  for(const node of nodes)if(!node.hidden&&node.name==='a'&&node.attrs.href){
    if(links.length<limits.links)links.push({href:node.attrs.href,label:node.text});else linksLimited=true;
  }
  const candidates=[];let limited=false;
  for(const node of nodes){
    if(node.hidden||!RECORD.has(node.name)||!amounts(node.text||'').length)continue;
    // Process the deepest price blocks first; wrapping containers are handled
    // only when they supply an item name or the conditions around that price.
    if(node.parts.some(p=>typeof p!=='string'&&RECORD.has(p.name)&&amounts(p.text||'').length))continue;
    let chosen=node,omitted=false;
    for(let parent=node.parent;parent&&parent!==root;parent=parent.parent){
      if(!RECORD.has(parent.name))continue;
      const value=parent.text||'';
      const priceChildren=parent.parts.filter(p=>typeof p!=='string'&&amounts(p.text||'').length);
      if(priceChildren.length>1)break;
      const ordinaryContainer=['div','section'].includes(parent.name)&&value!==chosen.text&&amounts(value).length===amounts(chosen.text).length;
      if(value.length>1500||instruction.test(value)){
        if(ordinaryContainer){omitted=true;limited=true;}
        break;
      }
      if(['li','tr','article'].includes(parent.name)||
        ordinaryContainer||parent.parts.some(p=>typeof p!=='string'&&/^h[1-6]$/.test(p.name))||!itemNamed(chosen.text))chosen=parent;
      if(['li','tr','article'].includes(parent.name)||ordinaryContainer)break;
    }
    if(omitted)continue;
    const excerpt=chosen.text;
    if(!excerpt||excerpt.length>1500||!itemNamed(excerpt)||instruction.test(excerpt)||qualification(excerpt)&&!excerpt.includes('\n'))continue;
    candidates.push({excerpt,amounts:amounts(excerpt),node:chosen});
  }
  // Numeric-only table prices are eligible only under an explicit price/currency
  // column heading. Copy that heading with the row; never add a currency sign.
  const tableRows=new Map();
  for(const row of nodes){
    if(row.name!=='tr'||row.hidden)continue;
    let table=row.parent;while(table&&table.name!=='table')table=table.parent;
    if(table){if(!tableRows.has(table))tableRows.set(table,[]);tableRows.get(table).push(row);}
  }
  for(const rows of tableRows.values()){
    const heading=rows.find(r=>r.parts.some(p=>typeof p!=='string'&&p.name==='th'&&/\b(?:price|cost|rate|fee|CAD|USD|EUR|GBP)\b|[$€£¥]/i.test(p.text)));
    if(!heading)continue;
    const headings=heading.parts.filter(p=>typeof p!=='string'&&['td','th'].includes(p.name));
    for(const row of rows){
      if(row===heading||amounts(row.text).length||row.text.length>1000||instruction.test(row.text)||instruction.test(heading.text))continue;
      const cells=row.parts.filter(p=>typeof p!=='string'&&['td','th'].includes(p.name));
      if(cells.length!==headings.length||cells.some(c=>c.attrs.colspan||c.attrs.rowspan))continue;
      const literal=cells.filter((c,i)=>/\b(?:price|cost|rate|fee|CAD|USD|EUR|GBP)\b|[$€£¥]/i.test(headings[i].text)&&new RegExp('^'+number+'$').test(c.text)).map(c=>c.text);
      if(literal.length&&itemNamed(row.text))candidates.push({excerpt:heading.text+'\n'+row.text,amounts:literal,node:row});
    }
  }
  // HTML fragments and text-only HTML can lack a body or block element.
  if(!limited&&!candidates.length&&root.text.length<=1500&&amounts(root.text).length&&itemNamed(root.text)&&!instruction.test(root.text)&&!qualification(root.text))candidates.push({excerpt:root.text,amounts:amounts(root.text),node:root});
  // Read each visible block's own text once, preserving inline markup text.
  // Ancestor text is not flattened into a global condition for every service.
  const notes=[];
  function collectNotes(node){
    if(node.hidden)return;
    let own='';
    const flush=()=>{
      const value=normalize(own);own='';
      const copiedHeading=node.name==='th'&&candidates.some(entry=>entry.excerpt.includes(value));
      const headingLabel=/^h[1-6]$/.test(node.name)&&/^(?:prices?|rates?|conditions?)$/i.test(value);
      if(value&&qualification(value)&&!instruction.test(value)&&!copiedHeading&&!headingLabel)notes.push({text:value,node});
    };
    for(const part of node.parts){
      if(typeof part==='string')own+=part;
      else if(BLOCK.has(part.name)||['html','body'].includes(part.name)){flush();collectNotes(part);}
      else own+=content(part);
    }
    flush();
  }
  collectNotes(root);
  const result=finishConditions(candidates,notes,note=>{
    for(let scope=SCOPE.has(note.node.name)?note.node:note.node.parent||root;scope;scope=scope.parent){
      if(!SCOPE.has(scope.name))continue;
      let affected=candidates.filter(entry=>within(entry.node,scope));
      const headings=scope.parts.filter(part=>typeof part!=='string'&&/^h[1-6]$/.test(part.name)&&!part.hidden);
      const heading=headings.filter(part=>part.index<=note.node.index).at(-1);
      if(heading&&!pageWide.test(note.text)&&note.node.name!=='footer'){
        const end=headings.find(part=>part.index>heading.index&&part.name<=heading.name)?.index??Infinity;
        affected=affected.filter(entry=>within(note.node,entry.node)||entry.node.index>=heading.index&&entry.node.index<end);
        return affected.length?affected:null;
      }
      if(affected.length)return affected;
      // A condition in a separate named/semantic section cannot safely be
      // applied to a different section just because they share a page.
      if(SECTION.has(scope.name)||headings.length)return amounts(scope.text||'').length?[]:null;
    }
    return candidates.length?null:[];
  });
  return {...result,limited:limited||result.conditionsUnverified,links,linksLimited};
}
