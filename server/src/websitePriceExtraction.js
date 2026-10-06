import {Parser} from 'htmlparser2';
import {WebsiteImportError,WEBSITE_LIMITS} from './websitePriceTransport.js';

const BLOCK=new Set('address article aside blockquote br dd div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr li main nav ol p pre section table tbody td th thead tr ul'.split(' '));
const OMIT=new Set('script style template noscript iframe object embed svg math canvas head form textarea del s strike'.split(' '));
const RECORD=new Set(['body','main','li','tr','article','section','div','p','dd','dt','pre']);
const number='(?:\\d{1,3}(?:[ \\u00a0]\\d{3})+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)*|[.,]\\d+)';
const moneyPattern=new RegExp('(?:\\b(?:CA|US|AU|NZ|HK)|[CA])?[$€£¥]\\s*'+number+'|\\b(?:CAD|USD|EUR|GBP|AUD|NZD)\\s*'+number+'|\\b'+number+'\\s*(?:(?:CAD|USD|EUR|GBP|AUD|NZD|dollars?|cents?)\\b|¢)','gi');
// This is a conservative exclusion, not an instruction interpreter. Website
// text is never sent to a model; the only output is visible literal excerpts.
const instruction=/(?:ignore|disregard|override|forget)\b.{0,80}\b(?:instructions?|prompts?|rules?|previous|above)|\b(?:system|developer|assistant)\s*(?:message|prompt|instructions?|:)|\b(?:reveal|exfiltrate)\b|\b(?:you are|act as)\b.{0,60}\b(?:assistant|chatgpt|receptionist|agent)\b|\b(?:tell|instruct)\s+(?:the\s+)?(?:assistant|model|agent)\b/i;
const conditions=/\b(?:all prices|prices (?:include|exclude|are|subject)|tax(?:es)? (?:not )?included|plus tax|excluding tax)\b/i;
const globalCondition=/^(?:all prices\b|prices (?:include|exclude|are|subject)\b)/i;
const amounts=text=>[...text.matchAll(moneyPattern)].map(m=>m[0].trimEnd());
const normalize=text=>text.replace(/[\t\r\f ]+/g,' ').split('\n').map(s=>s.trim()).filter(Boolean).join('\n');
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
export function extractWebsitePrices(text,{plain=false,limits=WEBSITE_LIMITS}={}){
  if(Buffer.byteLength(text)>limits.pageBytes)throw new WebsiteImportError('WEBSITE_SIZE_LIMIT','The decoded website page exceeds the import size limit.');
  if(plain){
    const entries=[],notes=[];let extractionLimited=false;
    for(const block of text.split(/\r?\n\s*\r?\n/)){
      const lines=block.split(/\r?\n/).map(normalize).filter(Boolean);
      // A standalone, explicitly page-wide note can be shared. Tax wording
      // inside an item record belongs only to that item, even "All prices ...".
      if(lines.length===1&&globalCondition.test(lines[0])&&!amounts(lines[0]).length&&!instruction.test(lines[0])){notes.push(lines[0]);continue;}
      const starts=lines.flatMap((line,index)=>amounts(line).length?[index]:[]);
      for(let i=0;i<starts.length;i++){
        const excerpt=lines.slice(i===0?0:starts[i],starts[i+1]??lines.length).join('\n');
        if(excerpt.length>1500||instruction.test(excerpt)||!itemNamed(excerpt)){extractionLimited=true;continue;}
        entries.push({excerpt,amounts:amounts(excerpt)});
      }
    }
    return {entries,links:[],extractionLimited,conditions:[...new Set(notes)]};
  }
  const root={name:'root',parts:[],parent:null,hidden:false};const stack=[root],nodes=[],links=[];
  const parser=new Parser({
    onopentag(name,attrs){
      if(nodes.length>=limits.nodes||stack.length>=limits.depth)throw new WebsiteImportError('WEBSITE_STRUCTURE_LIMIT','The website page is too complex to import safely.');
      const parent=stack.at(-1),hidden=parent.hidden||OMIT.has(name)||Object.hasOwn(attrs,'hidden')||attrs['aria-hidden']?.toLowerCase()==='true'||hiddenStyle(attrs.style);
      const node={name,attrs,parts:[],parent,hidden};parent.parts.push(node);nodes.push(node);stack.push(node);
    },
    ontext(value){if(!stack.at(-1).hidden)stack.at(-1).parts.push(value);},
    onclosetag(){if(stack.length>1)stack.pop();}
  },{decodeEntities:true});
  parser.end(text);
  function content(node){
    if(node.text!==undefined)return node.text;
    if(node.hidden)return node.text='';
    return node.text=normalize(node.parts.map(part=>typeof part==='string'?part:(BLOCK.has(part.name)?'\n':'')+content(part)+(BLOCK.has(part.name)?'\n':'')).join(''));
  }
  content(root);
  function itemBoundary(node){
    if(node.itemBoundary!==undefined)return node.itemBoundary;
    return node.itemBoundary=['article','li','tr'].includes(node.name)||/^h[1-6]$/.test(node.name)||
      node.parts.some(part=>typeof part!=='string'&&!part.hidden&&itemBoundary(part));
  }
  let linksLimited=false;
  for(const node of nodes)if(!node.hidden&&node.name==='a'&&node.attrs.href){
    if(links.length<limits.links)links.push({href:node.attrs.href,label:node.text});else linksLimited=true;
  }
  // Only explicitly page-wide notes outside item containers may be shared.
  // A local "Tax included"/"Plus tax" is retained in its item's excerpt.
  const pageNotes=nodes.filter(node=>{
    if(node.hidden||!['p','small','footer'].includes(node.name)||
      !(globalCondition.test(node.text)||node.name==='footer'&&conditions.test(node.text))||amounts(node.text).length||instruction.test(node.text))return false;
    for(let parent=node.parent;parent&&parent!==root;parent=parent.parent){
      if(!['body','main','footer'].includes(parent.name))return false;
    }
    return true;
  });
  const noteNodes=new Set(pageNotes);
  const scopedNotes=new Map();
  for(const node of nodes){
    if(node.hidden||noteNodes.has(node)||!['p','small','footer'].includes(node.name)||
      !(globalCondition.test(node.text)||node.name==='footer'&&conditions.test(node.text))||amounts(node.text).length||instruction.test(node.text))continue;
    let scope=node.parent;
    while(scope&&scope!==root&&!amounts(scope.text).length){
      // A department without a literal price still owns its conditions. Never
      // climb out of that item to attach its note to a priced sibling.
      if(itemBoundary(scope)){scope=null;break;}
      scope=scope.parent;
    }
    if(!scope||scope===root||['body','main'].includes(scope.name))continue;
    if(!scopedNotes.has(scope))scopedNotes.set(scope,new Set());
    scopedNotes.get(scope).add(node.text);
  }
  const candidates=[];
  let extractionLimited=false,attempted=false;
  for(const node of nodes){
    if(node.hidden||!RECORD.has(node.name)||!amounts(node.text||'').length)continue;
    // Process the deepest price blocks first; wrapping containers are handled
    // only when they supply an item name or the conditions around that price.
    if(node.parts.some(p=>typeof p!=='string'&&RECORD.has(p.name)&&amounts(p.text||'').length))continue;
    attempted=true;
    let chosen=node,unsafe=false;
    for(let parent=node.parent;parent&&parent!==root;parent=parent.parent){
      if(['body','main'].includes(parent.name))break;
      if(!RECORD.has(parent.name))continue;
      const value=parent.text||'';
      const priceChildren=parent.parts.filter(p=>typeof p!=='string'&&amounts(p.text||'').length);
      if(priceChildren.length>1)break;
      if(parent.parts.some(p=>typeof p!=='string'&&!p.hidden&&p.text&&RECORD.has(p.name)&&!amounts(p.text).length&&itemBoundary(p)))break;
      // A bounded single-price container owns all its nearby context. Do not
      // discard restrictions just because the price paragraph already names
      // the item, and never fall back to a bare price if its context is unsafe.
      if(value.length>1500||instruction.test(value)){unsafe=true;break;}
      chosen=parent;
      if(['li','tr','article'].includes(parent.name))break;
    }
    let excerpt=chosen.text;
    // Loose paragraphs also occur without a card wrapper. Following paragraphs
    // belong to that price until the next item/heading/separator; explicit page
    // notes are appended separately. Never cross an article or table-row edge.
    if(!['li','tr','article'].includes(chosen.name)){
      const siblings=chosen.parent.parts;
      for(let i=siblings.indexOf(chosen)+1;i<siblings.length;i++){
        const sibling=siblings[i];
        if(typeof sibling==='string'){if(sibling.trim())excerpt+='\n'+normalize(sibling);continue;}
        if(['hr','h1','h2','h3','h4','h5','h6'].includes(sibling.name))break;
        if(sibling.hidden||!sibling.text)continue;
        if(noteNodes.has(sibling))break;
        if(!['p','small','span','dd'].includes(sibling.name)||amounts(sibling.text).length)break;
        excerpt+='\n'+sibling.text;
      }
    }
    if(unsafe||!excerpt||excerpt.length>1500||!itemNamed(excerpt)||instruction.test(excerpt)){extractionLimited=true;continue;}
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
  const owned=[];
  for(const candidate of candidates){
    let excerpt=candidate.excerpt;
    // An explicit all-prices note can govern a group of cards without applying
    // to a different department elsewhere on the page.
    for(let scope=candidate.node;scope&&scope!==root;scope=scope.parent){
      for(const note of scopedNotes.get(scope)||[])if(!excerpt.includes(note))excerpt+='\n'+note;
    }
    if(excerpt.length>1500){extractionLimited=true;continue;}
    owned.push({excerpt,amounts:candidate.amounts});
  }
  const unique=[...new Map(owned.map(e=>[e.excerpt,e])).values()];
  // HTML fragments and text-only HTML can lack a body or block element.
  if(!attempted&&!unique.length&&root.text.length<=1500&&amounts(root.text).length&&itemNamed(root.text)&&!instruction.test(root.text))unique.push({excerpt:root.text,amounts:amounts(root.text)});
  // Exact duplicates only: a shorter excerpt can be a distinct offering.
  // Avoid pairwise substring scans on large or adversarial pages.
  const entries=unique;
  return {entries,links,linksLimited,extractionLimited,conditions:[...new Set(pageNotes.map(n=>n.text))]};
}
