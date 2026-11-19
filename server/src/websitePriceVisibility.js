// Which page elements a visitor cannot see, decided element by element from the
// page's own styling, as a desktop browser (1280 px wide) would apply it.
//
// The importer must take every price a visitor can see and skip prices the page
// hides (hidden blocks, struck-through old prices, screen-reader-only text).
// Styling that cannot hide anything (fonts, colours, spacing, borders, layout)
// is ignored. A rule that could hide something but cannot be read exactly (a
// var() value, a :not() selector) is applied as broadly as it could reach, so a
// price it might hide is skipped rather than imported. A stylesheet that cannot
// be fetched is ignored; everything imported stays a draft the owner reviews.
const SCREEN_WIDTH=1280,SCREEN_HEIGHT=800,EM=16;
const RELEVANT=new Set(['display','visibility','opacity','content-visibility','font-size','color','-webkit-text-fill-color','background',
  'background-color','text-decoration','text-decoration-line','clip','clip-path','transform','translate','scale','text-indent','width',
  'height','max-width','max-height','overflow','overflow-x','overflow-y','position','left','top','right','filter']);
const RULE_LIMIT=20000,CHECK_LIMIT=20_000_000;
const PSEUDO_ELEMENTS=/::|:(?:before|after|first-line|first-letter|placeholder|selection|marker|backdrop)\b/i;

// ---- Text helpers ----------------------------------------------------------
// Split on a separator at depth 0, outside strings and brackets.
function splitTop(text,separator){
  const out=[];let depth=0,quote=null,start=0;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quote){if(c==='\\')i++;else if(c===quote)quote=null;continue;}
    if(c==='"'||c==="'"){quote=c;continue;}
    if(c==='\\'){i++;continue;}
    if(c==='('||c==='[')depth++;else if((c===')'||c===']')&&depth>0)depth--;
    else if(c===separator&&depth===0){out.push(text.slice(start,i));start=i+1;}
  }
  out.push(text.slice(start));return out;
}
// Index of the brace that closes the block opened at `open`, or -1.
function closing(text,open){
  let depth=0,quote=null;
  for(let i=open;i<text.length;i++){
    const c=text[i];
    if(quote){if(c==='\\')i++;else if(c===quote)quote=null;continue;}
    if(c==='"'||c==="'"){quote=c;continue;}
    if(c==='\\'){i++;continue;}
    if(c==='{')depth++;else if(c==='}'){depth--;if(depth===0)return i;}
  }
  return -1;
}
// First top-level `{` or `;` from `from`, outside strings and brackets.
function nextStop(text,from){
  let depth=0,quote=null;
  for(let i=from;i<text.length;i++){
    const c=text[i];
    if(quote){if(c==='\\')i++;else if(c===quote)quote=null;continue;}
    if(c==='"'||c==="'"){quote=c;continue;}
    if(c==='\\'){i++;continue;}
    if(c==='('||c==='[')depth++;else if((c===')'||c===']')&&depth>0)depth--;
    else if(depth===0&&(c==='{'||c===';'))return i;
  }
  return -1;
}
function length(value){
  const m=String(value).trim().match(/^(-?\d*\.?\d+)(px|em|rem|%|pt|vw|vh)?$/i);
  if(!m)return null;
  const n=Number(m[1]),unit=(m[2]||'px').toLowerCase();
  if(unit==='em'||unit==='rem')return n*EM;
  if(unit==='pt')return n*4/3;
  if(unit==='vw')return n*SCREEN_WIDTH/100;
  if(unit==='vh')return n*SCREEN_HEIGHT/100;
  if(unit==='%')return n===0?0:null;
  return n;
}

// ---- Media queries: does this apply on a 1280 x 800 screen? -----------------
function mediaFeature(feature){
  const m=feature.match(/^\(\s*([a-z-]+)\s*(?::\s*([^)]+?))?\s*\)$/i);
  if(!m){
    // Range syntax: (width >= 768px), (400px <= width <= 900px)
    const range=feature.replace(/^\(|\)$/g,'');
    const parts=range.split(/(<=|>=|<|>|=)/).map(p=>p.trim()).filter(Boolean);
    if(parts.length<3)return true;
    const size=name=>name==='width'?SCREEN_WIDTH:name==='height'?SCREEN_HEIGHT:null;
    for(let i=0;i+2<parts.length;i+=2){
      let left=parts[i],op=parts[i+1],right=parts[i+2];
      const l=size(left)??length(left),r=size(right)??length(right);
      if(l===null||r===null)return true;
      if(!({'<':l<r,'<=':l<=r,'>':l>r,'>=':l>=r,'=':l===r})[op])return false;
    }
    return true;
  }
  const name=m[1].toLowerCase(),value=(m[2]||'').trim().toLowerCase(),px=length(value);
  if(name==='min-width')return px===null||SCREEN_WIDTH>=px;
  if(name==='max-width')return px===null||SCREEN_WIDTH<=px;
  if(name==='min-height')return px===null||SCREEN_HEIGHT>=px;
  if(name==='max-height')return px===null||SCREEN_HEIGHT<=px;
  if(name==='orientation')return value!=='portrait';
  if(name==='prefers-color-scheme')return value!=='dark';
  if(name==='prefers-reduced-motion')return value!=='reduce';
  if(name==='hover'||name==='any-hover')return value!=='none';
  if(name==='pointer'||name==='any-pointer')return value!=='coarse'&&value!=='none';
  return true;
}
function mediaMatches(query){
  const list=splitTop(String(query||'').trim(),',').map(q=>q.trim()).filter(Boolean);
  if(!list.length)return true;
  return list.some(q=>{
    let text=q.toLowerCase(),negate=false;
    if(text.startsWith('not ')){negate=true;text=text.slice(4).trim();}
    if(text.startsWith('only '))text=text.slice(5).trim();
    const type=text.match(/^([a-z-]+)\b/);
    let ok=true;
    if(type&&!text.startsWith('(')){
      ok=['all','screen'].includes(type[1]);text=text.slice(type[0].length).trim().replace(/^and\s+/,'');
    }
    if(ok&&text)for(const feature of text.split(/\s+and\s+/))if(!mediaFeature(feature.trim())){ok=false;break;}
    return negate?!ok:ok;
  });
}

// ---- Selectors --------------------------------------------------------------
const identChar='(?:[a-zA-Z0-9_\\u00a0-\\uffff-]|\\\\[^\\n])';
const IDENT=new RegExp('^-?(?:[a-zA-Z_\\u00a0-\\uffff]|\\\\[^\\n])'+identChar+'*');
const unescape=value=>value.replace(/\\([0-9a-fA-F]{1,6}\s?|[^\n])/g,(_,c)=>/^[0-9a-fA-F]/.test(c)&&c.trim().length>1?String.fromCodePoint(parseInt(c,16)):c.trim()||c);
// Removes pseudo-classes (:hover, :not(...), :nth-child(2n)) so the selector
// matches every element it could match: a broader match only skips more prices.
function stripPseudoClasses(source){
  let out='',b=0;
  for(let i=0;i<source.length;i++){
    const c=source[i];
    if(c==='\\'){out+=c+(source[i+1]??'');i++;continue;}
    if(c===':'){
      b++;let j=i+1;while(j<source.length&&/[a-zA-Z0-9_-]/.test(source[j]))j++;
      if(source[j]==='('){let depth=0;for(;j<source.length;j++){if(source[j]==='(')depth++;else if(source[j]===')'){depth--;if(depth===0){j++;break;}}}}
      i=j-1;continue;
    }
    out+=c;
  }
  return {text:out,pseudoClasses:b};
}
function compound(source){
  const tests=[];let rest=source,b=0,c=0;
  const tag=rest.match(/^(?:[a-zA-Z][a-zA-Z0-9-]*|\*)/);
  if(tag){if(tag[0]!=='*'){const name=tag[0].toLowerCase();tests.push(node=>node.name===name);c++;}rest=rest.slice(tag[0].length);}
  while(rest){
    if(rest[0]==='.'||rest[0]==='#'){
      const m=rest.slice(1).match(IDENT);if(!m)return null;
      const value=unescape(m[0]);
      tests.push(rest[0]==='#'?node=>node.attrs.id===value:node=>(node.attrs.class||'').split(/\s+/).includes(value));
      if(rest[0]==='#')b+=100;else b++;
      rest=rest.slice(1+m[0].length);continue;
    }
    if(rest[0]==='['){
      const end=rest.indexOf(']');if(end<0)return null;
      const body=rest.slice(1,end).trim(),m=body.match(/^([a-zA-Z_][\w:-]*)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+))(?:\s+[is])?)?$/);
      if(!m)return null;
      const name=m[1].toLowerCase(),op=m[2],value=m[3]??m[4]??m[5];
      tests.push(node=>{
        if(!Object.hasOwn(node.attrs,name))return false;
        const actual=String(node.attrs[name]);
        if(!op)return true;
        if(op==='=')return actual===value;
        if(op==='~=')return actual.split(/\s+/).includes(value);
        if(op==='|=')return actual===value||actual.startsWith(value+'-');
        if(op==='^=')return actual.startsWith(value);
        if(op==='$=')return actual.endsWith(value);
        return actual.includes(value);
      });
      b++;rest=rest.slice(end+1);continue;
    }
    return null;
  }
  return {test:tests.length?node=>tests.every(test=>test(node)):()=>true,b,c,key:keyOf(source)};
}
function keyOf(source){
  const id=source.match(/#((?:[a-zA-Z0-9_ -￿-]|\\[^\n])+)/);if(id)return 'id:'+unescape(id[1]);
  const cls=source.match(/\.((?:[a-zA-Z0-9_ -￿-]|\\[^\n])+)/);if(cls)return 'class:'+unescape(cls[1]);
  const tag=source.match(/^([a-zA-Z][a-zA-Z0-9-]*)/);if(tag)return 'tag:'+tag[1].toLowerCase();
  return 'any';
}
// Returns {match, specificity, key} or null when the selector cannot apply to an
// element's own text (pseudo-elements) or cannot be read at all.
function selector(source){
  let text=source.trim();
  if(!text||PSEUDO_ELEMENTS.test(text)||text.includes('|'))return null;
  const stripped=stripPseudoClasses(text);text=stripped.text.trim();
  // A sibling combinator only narrows which elements match; keep the part after
  // the last one, which matches every element the full selector could.
  const sibling=Math.max(text.lastIndexOf('+'),text.lastIndexOf('~'));
  if(sibling>=0&&!/\[[^\]]*$/.test(text.slice(0,sibling)))text=text.slice(sibling+1).trim();
  const tokens=text.replace(/\s*>\s*/g,' > ').split(/\s+/).filter(Boolean);
  if(!tokens.length||tokens.length>64||tokens[0]==='>'||tokens.at(-1)==='>')return null;
  const parts=[];let b=stripped.pseudoClasses,c=0;
  for(let i=0;i<tokens.length;i++){
    if(tokens[i]==='>')return null;
    const part=compound(tokens[i]);if(!part)return null;
    parts.push({test:part.test,direct:i>0&&tokens[i-1]==='>'});b+=part.b;c+=part.c;
    if(tokens[i+1]==='>')i++;
  }
  const match=node=>{
    let cursor=node,index=parts.length-1;if(!parts[index].test(cursor))return false;
    while(index>0){const direct=parts[index].direct;index--;cursor=cursor.parent;
      if(!cursor||!cursor.attrs)return false;
      if(direct){if(!parts[index].test(cursor))return false;}
      else{while(cursor&&cursor.attrs&&!parts[index].test(cursor))cursor=cursor.parent;if(!cursor||!cursor.attrs)return false;}
    }return true;
  };
  const last=tokens.at(-1);
  return {match,specificity:b*1000+c,key:keyOf(last)};
}

// ---- Stylesheets ------------------------------------------------------------
function declarations(body){
  const out=[];
  for(const piece of splitTop(body,';')){
    const colon=piece.indexOf(':');if(colon<0)continue;
    const property=piece.slice(0,colon).trim().toLowerCase();if(!RELEVANT.has(property))continue;
    let value=piece.slice(colon+1).trim(),important=false;
    if(/!\s*important\s*$/i.test(value)){important=true;value=value.replace(/!\s*important\s*$/i,'').trim();}
    out.push({property,value:value.toLowerCase(),important});
  }
  return out;
}
// Collects rules that set a visibility-related property, in source order, and
// the same-host stylesheets an @import names.
function parseStylesheet(css,state){
  css=css.replace(/\/\*[\s\S]*?\*\//g,'');
  let at=0;
  while(at<css.length){
    while(at<css.length&&/[\s;]/.test(css[at]))at++;
    if(at>=css.length)break;
    if(css.startsWith('<!--',at)){at+=4;continue;}
    if(css.startsWith('-->',at)){at+=3;continue;}
    const stop=nextStop(css,at);if(stop<0)break;
    const prelude=css.slice(at,stop).trim();
    if(css[stop]===';'){
      const m=prelude.match(/^@import\s+(?:url\(\s*)?["']?([^"')\s]+)["']?\s*\)?\s*(.*)$/i);
      if(m&&mediaMatches(m[2]))state.imports.push(m[1]);
      at=stop+1;continue;
    }
    const end=closing(css,stop);if(end<0)break;
    const body=css.slice(stop+1,end);at=end+1;
    if(prelude.startsWith('@')){
      const name=(prelude.match(/^@([a-zA-Z-]+)/)||[])[1]?.toLowerCase();
      if(name==='media'){if(mediaMatches(prelude.slice(6)))parseStylesheet(body,state);}
      else if(['supports','layer','container','document','-moz-document','scope'].includes(name))parseStylesheet(body,state);
      continue; // @font-face, @keyframes, @page and the like style nothing on the page.
    }
    // CSS nesting: nested rules sit inside a rule body; read only its own declarations.
    const own=body.replace(/[^;{}]*\{[^{}]*\}/g,'');
    const list=declarations(own);
    if(!list.length)continue;
    for(const part of splitTop(prelude,',')){
      const sel=selector(part);if(!sel)continue;
      if(state.rules.length>=RULE_LIMIT){state.overflow=true;return;}
      state.rules.push({...sel,declarations:list,order:state.rules.length});
    }
  }
}

// ---- What a set of winning values hides --------------------------------------
const unresolved=value=>/var\(|env\(|calc\(|attr\(|inherit|revert|unset/.test(value);
function transparent(value){
  return /^transparent$/.test(value)||/^#[0-9a-f]{3}0$|^#[0-9a-f]{6}00$/.test(value)||/(?:rgba?|hsla?)\([^)]*[,/]\s*0(?:\.0+)?%?\s*\)$/.test(value);
}
function hides(values){
  const v=property=>values.get(property);
  const display=v('display');if(display!==undefined&&(display==='none'||(unresolved(display))))return true;
  const visibility=v('visibility');if(visibility!==undefined&&(['hidden','collapse'].includes(visibility)||unresolved(visibility)))return true;
  const opacity=v('opacity');if(opacity!==undefined&&(/^(?:0+(?:\.0+)?|\.0+)%?$/.test(opacity)||unresolved(opacity)))return true;
  const cv=v('content-visibility');if(cv==='hidden')return true;
  const size=v('font-size');if(size!==undefined&&length(size)===0)return true;
  const color=v('-webkit-text-fill-color')??v('color');
  if(color!==undefined&&transparent(color))return true;
  const background=v('background-color')??v('background');
  if(color!==undefined&&background!==undefined&&!unresolved(color)&&color.trim()===background.trim())return true;
  const decoration=v('text-decoration-line')??v('text-decoration');if(decoration&&decoration.includes('line-through'))return true;
  const clip=v('clip');if(clip){const m=clip.match(/^rect\(([^)]*)\)$/);if(m&&m[1].split(/[\s,]+/).filter(Boolean).every(n=>{const px=length(n);return px!==null&&Math.abs(px)<=1;}))return true;}
  const clipPath=v('clip-path');if(clipPath&&/^(?:inset\(\s*50%|circle\(\s*0|ellipse\(\s*0|polygon\(\s*0(?:px)?\s+0(?:px)?\s*\))/.test(clipPath))return true;
  const transform=[v('transform'),v('scale'),v('translate')].filter(Boolean).join(' ');
  if(/scale[xy]?\(\s*0(?:\.0+)?\s*[,)]/.test(transform)||/^0(?:\.0+)?$/.test(v('scale')||'x'))return true;
  for(const m of transform.matchAll(/translate[xy3d]*\(([^)]*)\)/g))for(const n of m[1].split(/[\s,]+/)){const px=length(n);if(px!==null&&Math.abs(px)>=1000)return true;}
  for(const n of (v('translate')||'').split(/\s+/)){const px=length(n);if(px!==null&&Math.abs(px)>=1000)return true;}
  const indent=v('text-indent');if(indent!==undefined){const px=length(indent);if(px!==null&&Math.abs(px)>=1000)return true;}
  for(const property of ['width','height','max-width','max-height']){const value=v(property);if(value!==undefined&&length(value)===0)return true;}
  const overflow=[v('overflow'),v('overflow-x'),v('overflow-y')].some(value=>value&&/hidden|clip/.test(value));
  if(overflow&&['width','height'].some(property=>{const px=length(v(property)??'');return px!==null&&px<=1;}))return true;
  const position=v('position');
  if(position&&['absolute','fixed'].includes(position)&&['left','top','right'].some(property=>{const px=length(v(property)??'');return px!==null&&px<=-999;}))return true;
  const filter=v('filter');if(filter&&/opacity\(\s*0(?:\.0+)?%?\s*\)/.test(filter))return true;
  return false;
}

// ---- Apply to the parsed page -----------------------------------------------
export function applyWebsiteVisibility(nodes,{stylesheets={}}={}){
  const linked=[],state={rules:[],imports:[],overflow:false},missing=[];
  const read=(css,href)=>{
    if(typeof css!=='string'){if(href)missing.push(href);return;}
    const imports=state.imports;state.imports=[];
    parseStylesheet(css,state);
    for(const url of state.imports)read(stylesheets[url],url);
    state.imports=imports;
  };
  for(const node of nodes){
    if(node.name==='link'&&(node.attrs.rel||'').toLowerCase().split(/\s+/).includes('stylesheet')&&node.attrs.href&&!Object.hasOwn(node.attrs,'disabled')){
      if(mediaMatches(node.attrs.media))read(stylesheets[node.attrs.href],node.attrs.href);
      linked.push(node.attrs.href);
    }
    if(node.name==='style'&&mediaMatches(node.attrs.media))read(node.parts.filter(value=>typeof value==='string').join(''));
  }
  if(state.overflow)return {verified:false,stylesheetLinks:[...new Set([...linked,...missing])]};
  // Index rules by the key of their rightmost part so each element checks only
  // rules that could match it.
  const index=new Map();
  for(const rule of state.rules){const list=index.get(rule.key)||[];list.push(rule);index.set(rule.key,list);}
  let checks=0;
  for(const node of nodes){
    if(node.parent?.hidden)node.hidden=true;
    if(node.hidden)continue;
    const candidates=[...(index.get('any')||[]),...(index.get('tag:'+node.name)||[]),...(node.attrs.id?index.get('id:'+node.attrs.id)||[]:[]),
      ...String(node.attrs.class||'').split(/\s+/).filter(Boolean).flatMap(name=>index.get('class:'+name)||[])];
    const winners=new Map();
    const consider=(declaration,rank)=>{
      const prior=winners.get(declaration.property);
      if(!prior||rank.important>prior.important||(rank.important===prior.important&&(rank.specificity>prior.specificity||(rank.specificity===prior.specificity&&rank.order>=prior.order))))
        winners.set(declaration.property,{...rank,value:declaration.value});
    };
    for(const rule of [...new Set(candidates)]){
      if((checks+=1)>CHECK_LIMIT)return {verified:false,stylesheetLinks:[...new Set([...linked,...missing])]};
      if(!rule.match(node))continue;
      for(const declaration of rule.declarations)consider(declaration,{important:declaration.important?1:0,specificity:rule.specificity,order:rule.order});
    }
    // An inline style attribute outranks every stylesheet rule that is not !important.
    if(node.attrs.style)for(const declaration of declarations(node.attrs.style))consider(declaration,{important:declaration.important?1:0,specificity:1e9,order:Infinity});
    const values=new Map([...winners].map(([property,winner])=>[property,winner.value]));
    if(values.size&&hides(values))node.hidden=true;
  }
  return {verified:true,stylesheetLinks:[...new Set(missing)]};
}
