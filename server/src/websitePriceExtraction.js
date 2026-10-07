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
    const lines=text.split(/\r?\n/).map(normalize),entries=[];let limited=false;
    for(let i=0;i<lines.length;i++){
      const line=lines[i];
      if(!amounts(line).length||!itemNamed(line)||instruction.test(line))continue;
      const parts=[line];
      while(i+1<lines.length&&lines[i+1]&&!amounts(lines[i+1]).length&&!instruction.test(lines[i+1]))parts.push(lines[++i]);
      const excerpt=parts.join('\n');
      if(excerpt.length>1500){limited=true;continue;}
      entries.push({excerpt,amounts:amounts(excerpt)});
    }
    return {entries,limited,links:[],conditions:lines.filter(line=>line.length<=500&&conditions.test(line)&&!instruction.test(line))};
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
    if(!excerpt||excerpt.length>1500||!itemNamed(excerpt)||instruction.test(excerpt))continue;
    candidates.push({excerpt,amounts:amounts(excerpt)});
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
      if(literal.length&&itemNamed(row.text))candidates.push({excerpt:heading.text+'\n'+row.text,amounts:literal});
    }
  }
  const unique=[...new Map(candidates.map(e=>[e.excerpt,e])).values()];
  // HTML fragments and text-only HTML can lack a body or block element.
  if(!limited&&!unique.length&&root.text.length<=1500&&amounts(root.text).length&&itemNamed(root.text)&&!instruction.test(root.text))unique.push({excerpt:root.text,amounts:amounts(root.text)});
  // Exact duplicates only: a shorter excerpt can be a distinct offering.
  // Avoid pairwise substring scans on large or adversarial pages.
  const entries=unique;
  const notes=nodes.filter(n=>!n.hidden&&['p','small','footer'].includes(n.name)&&n.text?.length<=500&&conditions.test(n.text)&&!instruction.test(n.text)).map(n=>n.text);
  return {entries,limited,links,linksLimited,conditions:[...new Set(notes)]};
}
