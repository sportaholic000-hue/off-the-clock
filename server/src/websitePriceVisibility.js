// Static visibility for website price drafts. Imported prices are always an
// unsaved draft that the owner reviews, so styling the importer does not model
// is skipped rather than discarding the whole page: an element is omitted only
// when a hiding attribute, inline style or stylesheet rule that is modeled here
// hides it. When a stylesheet could not be read, or a rule that could hide
// content cannot be evaluated, the result is flagged so the owner is told.
// Every loop is bounded by the input size (itself bounded by the transport)
// and by the explicit rule and check budgets below.

const MAX_RULES=20000,MAX_CHECKS=2000000,MAX_SELECTOR=1024,MAX_DEPTH=16;
// Font services serve @font-face rules only; they cannot hide page text.
const FONT_HOSTS=new Set(['fonts.googleapis.com','fonts.bunny.net','use.typekit.net','fonts.cdnfonts.com']);
const MODELED=new Set(['display','visibility','opacity','content-visibility','text-decoration','text-decoration-line','font-size','font',
  'color','-webkit-text-fill-color','background-color','background','background-clip','-webkit-background-clip','position','clip','clip-path',
  'width','height','max-height','max-width','overflow','overflow-x','overflow-y','text-indent','left','top','transform']);
const DYNAMIC=new Set(['hover','focus','focus-visible','focus-within','active','visited','link','any-link','target','checked','indeterminate',
  'placeholder-shown','autofill','user-invalid','user-valid','invalid','valid','disabled','enabled','default','in-range','out-of-range','required','optional',
  'read-only','read-write','playing','paused','fullscreen','modal','popover-open','open','closed','defined','lang','dir','host','scope']);
const LEGACY_ELEMENTS=new Set(['before','after','first-line','first-letter','selection','placeholder','marker','backdrop']);
const unresolved=/\b(?:var|env|calc|attr|min|max|clamp)\(|\b(?:inherit|unset|revert|revert-layer)\b/;

// ---- CSS text scanning ------------------------------------------------------
function stripComments(css){
  let out='',i=0;
  while(i<css.length){
    const c=css[i];
    if(c==='/'&&css[i+1]==='*'){const end=css.indexOf('*/',i+2);if(end<0)break;i=end+2;out+=' ';continue;}
    if(c==='"'||c==="'"){const start=i;i++;while(i<css.length&&css[i]!==c&&css[i]!=='\n'){if(css[i]==='\\')i++;i++;}i++;out+=css.slice(start,i);continue;}
    out+=c;i++;
  }
  return out;
}
// Index just past a quoted string or a parenthesised group starting at i.
function skipQuoted(css,i){const q=css[i];i++;while(i<css.length&&css[i]!==q&&css[i]!=='\n'){if(css[i]==='\\')i++;i++;}return i+1;}
// Split on a separator at depth zero (outside strings, (), []).
function splitTop(text,separator){
  const out=[];let depth=0,start=0;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='\\'){i++;continue;}
    if(c==='"'||c==="'"){i=skipQuoted(text,i)-1;continue;}
    if(c==='('||c==='[')depth++;else if((c===')'||c===']')&&depth>0)depth--;
    else if(c===separator&&depth===0){out.push(text.slice(start,i));start=i+1;}
  }
  out.push(text.slice(start));return out;
}
// Parse a block body into top-level declarations and nested blocks.
function parseBlock(css,start,end){
  const items=[];let i=start,prelude=start;
  while(i<end){
    const c=css[i];
    if(c==='\\'){i+=2;continue;}
    if(c==='"'||c==="'"){i=skipQuoted(css,i);continue;}
    if(c==='('){let depth=1;i++;while(i<end&&depth){if(css[i]==='\\')i++;else if(css[i]==='"'||css[i]==="'"){i=skipQuoted(css,i);continue;}else if(css[i]==='(')depth++;else if(css[i]===')')depth--;i++;}continue;}
    if(c===';'){items.push({text:css.slice(prelude,i)});i++;prelude=i;continue;}
    if(c==='{'){
      let depth=1,j=i+1;
      while(j<end&&depth){const d=css[j];if(d==='\\')j++;else if(d==='"'||d==="'"){j=skipQuoted(css,j);continue;}else if(d==='{')depth++;else if(d==='}')depth--;j++;}
      items.push({prelude:css.slice(prelude,i).trim(),start:i+1,end:depth?j:j-1});i=j;prelude=i;continue;
    }
    i++;
  }
  if(css.slice(prelude,end).trim())items.push({text:css.slice(prelude,end)});
  return items;
}
function declarations(text){
  const out=[];
  for(const part of splitTop(text,';')){
    const colon=part.indexOf(':');if(colon<1)continue;
    const property=part.slice(0,colon).trim().toLowerCase();if(!property||property.startsWith('--'))continue;
    let value=part.slice(colon+1).trim();const important=/!\s*important\s*$/i.test(value);
    if(important)value=value.replace(/!\s*important\s*$/i,'').trim();
    out.push({property,value:value.toLowerCase(),important});
  }
  return out;
}
// ---- Declarations that hide content ----------------------------------------
const zeroLength=value=>/^[-+]?0*\.?0+(?:px|em|rem|%|pt|pc|cm|mm|in|vw|vh|vmin|vmax|ex|ch)?$/.test(value);
const lengthPx=value=>{const m=value.match(/^([-+]?\d*\.?\d+)(px)?$/);return m?Number(m[1]):null;};
function fontShorthandZero(value){
  const tokens=value.replace(/\s*\/\s*/g,'/').split(/\s+/);
  for(const token of tokens){const size=token.split('/')[0];
    if(zeroLength(size))return true;
    if(/^\d*\.?\d+(?:px|em|rem|%|pt|pc|cm|mm|in|vw|vh|vmin|vmax|ex|ch)$/.test(size)||/^(?:xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|smaller|larger)$/.test(size))return false;}
  return false;
}
function transparentColor(value){
  if(value==='transparent')return true;
  if(/^#[0-9a-f]{3}0$/.test(value)||/^#[0-9a-f]{6}00$/.test(value))return true;
  return /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(.*(?:,|\/)\s*0*\.?0+%?\s*\)$/.test(value);
}
function opacityZero(value){return /^[-+]?0*\.?0+%?$/.test(value);}
// Declarations that hide text by themselves: a rule carrying one that cannot
// be evaluated is reported to the owner instead of being assumed visible.
function flagDeclaration({property,value}){
  if(['clip','clip-path','transform','text-indent','height','max-height','width'].includes(property))return false;
  return hidingDeclaration({property,value});
}
function hidingDeclaration({property,value}){
  if(property==='display')return value==='none';
  if(property==='visibility')return value==='hidden'||value==='collapse';
  if(property==='content-visibility')return value==='hidden';
  if(property==='opacity')return opacityZero(value);
  if(property==='text-decoration'||property==='text-decoration-line')return value.includes('line-through');
  if(property==='font-size')return zeroLength(value);
  if(property==='font')return fontShorthandZero(value);
  if(property==='color'||property==='-webkit-text-fill-color')return transparentColor(value);
  if(property==='clip'||property==='clip-path')return value!=='auto'&&value!=='none';
  if(property==='transform')return /scale[xy3d]*\(\s*0*\.?0+\s*[,)]/.test(value);
  if(property==='text-indent'){const px=lengthPx(value);return px!==null&&px<=-999;}
  if(property==='height'||property==='max-height'||property==='width')return zeroLength(value);
  return false;
}
// ---- Selectors --------------------------------------------------------------
function readIdent(text,i){
  let out='';
  while(i<text.length){
    const c=text[i];
    if(c==='\\'){
      const hex=text.slice(i+1).match(/^[0-9a-fA-F]{1,6}/);
      if(hex){const code=parseInt(hex[0],16);out+=code>0&&code<=0x10ffff?String.fromCodePoint(code):'�';i+=1+hex[0].length;if(/[ \t\n\r\f]/.test(text[i]||''))i++;continue;}
      if(i+1>=text.length)return null;out+=text[i+1];i+=2;continue;
    }
    if(/[a-zA-Z0-9_\- -￿]/.test(c)){out+=c;i++;continue;}
    break;
  }
  return out?{value:out,end:i}:null;
}
// Returns {test,spec,key} for a compound, 'dynamic' when it only applies in an
// interactive state, or null when it is not modeled.
function compound(text){
  const tests=[];let i=0,spec=[0,0,0],key=null,dynamic=false;
  if(text[0]==='*'){i=1;}
  else if(/[a-zA-Z]/.test(text[0]||'')){const tag=readIdent(text,0);if(!tag)return null;const name=tag.value.toLowerCase();tests.push(n=>n.name===name);spec[2]++;key??='t:'+name;i=tag.end;}
  while(i<text.length){
    const c=text[i];
    if(c==='#'||c==='.'){
      const ident=readIdent(text,i+1);if(!ident)return null;const value=ident.value;
      if(c==='#'){tests.push(n=>n.attrs.id===value);spec[0]++;key='i:'+value;}
      else{tests.push(n=>classes(n).has(value));spec[1]++;if(!key||key[0]==='t')key='c:'+value;}
      i=ident.end;continue;
    }
    if(c==='['){
      const close=text.indexOf(']',i);if(close<0)return null;
      const m=text.slice(i+1,close).trim().match(/^([a-zA-Z_][\w-]*)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s"']+))\s*([is])?)?$/);
      if(!m)return null;
      const name=m[1].toLowerCase(),op=m[2],raw=m[3]??m[4]??m[5],insensitive=m[6]==='i';
      tests.push(n=>{
        if(!Object.hasOwn(n.attrs,name))return false;if(!op)return true;
        let actual=String(n.attrs[name]),want=raw;if(insensitive){actual=actual.toLowerCase();want=want.toLowerCase();}
        if(op==='=')return actual===want;
        if(op==='~=')return actual.split(/\s+/).includes(want);
        if(op==='|=')return actual===want||actual.startsWith(want+'-');
        if(!want)return false;
        if(op==='^=')return actual.startsWith(want);if(op==='$=')return actual.endsWith(want);return actual.includes(want);
      });
      spec[1]++;i=close+1;continue;
    }
    if(c===':'){
      if(text[i+1]===':')return 'element';
      const ident=readIdent(text,i+1);if(!ident)return null;const name=ident.value.toLowerCase();i=ident.end;
      let args=null;
      if(text[i]==='('){let depth=1,j=i+1;while(j<text.length&&depth){if(text[j]==='(')depth++;else if(text[j]===')')depth--;j++;}if(depth)return null;args=text.slice(i+1,j-1).trim();i=j;}
      if(LEGACY_ELEMENTS.has(name))return 'element';
      if(DYNAMIC.has(name)){dynamic=true;continue;}
      if(name==='root'&&args===null){tests.push(n=>n.name==='html');spec[1]++;continue;}
      if(['first-child','last-child','only-child'].includes(name)&&args===null){
        const pick=name;tests.push(n=>{const siblings=(n.parent?.parts||[]).filter(p=>typeof p!=='string');
          return pick==='first-child'?siblings[0]===n:pick==='last-child'?siblings.at(-1)===n:siblings.length===1;});spec[1]++;continue;
      }
      if(name==='not'&&args){
        const inner=splitTop(args,',').map(part=>compound(part.trim()));
        if(inner.some(part=>!part||typeof part==='string'))return null;
        tests.push(n=>!inner.some(part=>part.test(n)));
        const most=inner.reduce((a,b)=>compareSpec(a.spec,b.spec)>=0?a:b);for(let k=0;k<3;k++)spec[k]+=most.spec[k];
        continue;
      }
      return null;
    }
    return null;
  }
  if(dynamic)return 'dynamic';
  return {test:n=>n?.attrs!==undefined&&tests.every(t=>t(n)),spec,key};
}
const classCache=new WeakMap();
function classes(node){let set=classCache.get(node);if(!set){set=new Set(String(node.attrs.class||'').split(/\s+/).filter(Boolean));classCache.set(node,set);}return set;}
function compareSpec(a,b){for(let k=0;k<3;k++)if(a[k]!==b[k])return a[k]-b[k];return 0;}
// Complex selector: compounds joined by descendant or child combinators.
function complexSelector(text){
  text=text.trim();if(!text||text.length>MAX_SELECTOR||text.includes('|')||text.includes('&'))return null;
  const parts=[];let i=0,current='',combinator=null,depth=0;
  const push=()=>{if(!current)return true;const c=compound(current);if(c===null)return false;parts.push({c,combinator});current='';combinator=null;return true;};
  while(i<text.length){
    const ch=text[i];
    if(ch==='\\'){current+=text.slice(i,i+2);i+=2;continue;}
    if(ch==='"'||ch==="'"){const end=skipQuoted(text,i);current+=text.slice(i,end);i=end;continue;}
    if(ch==='('||ch==='[')depth++;else if((ch===')'||ch===']')&&depth>0)depth--;
    if(depth===0&&(/\s/.test(ch)||ch==='>'||ch==='+'||ch==='~')){
      if(!push())return null;
      let j=i,found=' ';
      while(j<text.length&&(/\s/.test(text[j])||'>+~'.includes(text[j]))){if(text[j]!==' '&&!/\s/.test(text[j]))found=found===' '?text[j]:'!';j++;}
      if(found==='+'||found==='~'||found==='!')return null;
      if(parts.length)combinator=found;i=j;continue;
    }
    current+=ch;i++;
  }
  if(!push()||!parts.length)return null;
  if(parts.some(p=>p.c==='element'))return 'element';
  if(parts.some(p=>p.c==='dynamic'))return 'dynamic';
  const spec=[0,0,0];for(const p of parts)for(let k=0;k<3;k++)spec[k]+=p.c.spec[k];
  const last=parts.at(-1).c;
  return {spec,key:last.key,match(node,budget){
    if(!budget.take())return false;
    if(!last.test(node))return false;
    let cursor=node;
    for(let index=parts.length-1;index>0;index--){
      const direct=parts[index].combinator==='>',want=parts[index-1].c;cursor=cursor.parent;
      if(direct){if(!budget.take()||!cursor||!want.test(cursor))return false;}
      else{while(cursor&&cursor.attrs!==undefined){if(!budget.take())return false;if(want.test(cursor))break;cursor=cursor.parent;}if(!cursor||cursor.attrs===undefined)return false;}
    }
    return true;
  }};
}
// ---- Media queries ----------------------------------------------------------
// 'always' for screen media that always apply, 'never' for print-only, and
// 'conditional' for viewport or feature queries.
function mediaApplies(query){
  const list=splitTop(String(query||'').toLowerCase(),',').map(q=>q.trim()).filter(Boolean);
  if(!list.length)return 'always';
  let any=false,conditional=false;
  for(const q of list){
    if(/^(?:only\s+)?(?:all|screen)$/.test(q)){any=true;continue;}
    if(/^(?:only\s+)?(?:print|speech|aural|braille|embossed|handheld|projection|tty|tv)$/.test(q)||/^not\s+(?:all|screen)$/.test(q))continue;
    conditional=true;
  }
  return any?'always':conditional?'conditional':'never';
}
// ---- Stylesheet collection --------------------------------------------------
function collectRules(css,state,condition){
  css=stripComments(css);
  walk(css,0,css.length,condition,0);
  function walk(source,start,end,mode,depth){
    if(depth>MAX_DEPTH){state.unchecked=true;return;}
    for(const item of parseBlock(source,start,end)){
      if(item.text!==undefined){if(/^\s*@import\b/i.test(item.text))state.unchecked=true;continue;}
      const prelude=item.prelude;
      if(prelude.startsWith('@')){
        const name=(prelude.match(/^@([-\w]+)/)?.[1]||'').toLowerCase();
        if(name==='media'){const applies=mediaApplies(prelude.slice(6));if(applies!=='never')walk(source,item.start,item.end,applies==='conditional'||mode==='conditional'?'conditional':mode,depth+1);}
        else if(name==='layer')walk(source,item.start,item.end,mode,depth+1);
        else if(name==='supports'||name==='container'||name==='scope'||name==='document'||name==='-moz-document')walk(source,item.start,item.end,mode==='conditional'?'conditional':'unknown',depth+1);
        // @font-face, @keyframes, @page, @property, @counter-style and other
        // descriptor blocks cannot hide page text.
        continue;
      }
      const inner=parseBlock(source,item.start,item.end),decls=[];
      for(const part of inner){
        if(part.text!==undefined){decls.push(...declarations(part.text));continue;}
        // Nested style rules are not modeled; flag them only when they could hide.
        if(declarations(source.slice(part.start,part.end)).some(flagDeclaration))state.unchecked=true;
      }
      const modeled=decls.filter(d=>MODELED.has(d.property));
      if(!modeled.length)continue;
      const hides=modeled.some(flagDeclaration);
      if(mode==='unknown'){if(hides)state.unchecked=true;continue;}
      for(const text of splitTop(prelude,',')){
        const selector=complexSelector(text);
        if(selector==='dynamic'||selector==='element')continue;
        if(!selector){if(hides)state.unchecked=true;continue;}
        if(state.rules.length>=MAX_RULES){state.unchecked=true;return;}
        const rule={selector,decls:modeled,conditional:mode==='conditional',order:state.rules.length};
        state.rules.push(rule);
        const bucket=state.index.get(selector.key||'*');if(bucket)bucket.push(rule);else state.index.set(selector.key||'*',[rule]);
      }
    }
  }
}
function fontService(href){try{return FONT_HOSTS.has(new URL(href,'https://same-host.invalid/').hostname.toLowerCase());}catch{return false;}}
export function stylesheetLinksToFetch(nodes){
  return nodes.filter(node=>node.name==='link'&&usableStylesheet(node)&&node.attrs.href&&!fontService(node.attrs.href)).map(node=>node.attrs.href);
}
function usableStylesheet(node){
  const rel=String(node.attrs.rel||'').toLowerCase().split(/\s+/);
  return rel.includes('stylesheet')&&!rel.includes('alternate')&&!Object.hasOwn(node.attrs,'disabled')&&mediaApplies(node.attrs.media)!=='never';
}
// ---- Cascade ----------------------------------------------------------------
// Rank: important declarations, then inline style, then specificity, then order.
function beats(a,b){
  if(!b)return true;
  if(a.important!==b.important)return a.important;
  if(a.inline!==b.inline)return a.inline;
  const s=compareSpec(a.spec,b.spec);if(s)return s>0;
  return a.order>b.order;
}
function hidesValue(property,value){return hidingDeclaration({property,value});}
export function applyWebsiteVisibility(nodes,{stylesheets={}}={}){
  const state={rules:[],index:new Map(),unchecked:false};
  for(const node of nodes){
    if(node.name==='style'){
      if(mediaApplies(node.attrs.media)==='never')continue;
      collectRules(node.parts.filter(v=>typeof v==='string').join(''),state,mediaApplies(node.attrs.media)==='conditional'?'conditional':'always');
    }else if(node.name==='link'&&usableStylesheet(node)&&node.attrs.href){
      const href=node.attrs.href;
      if(typeof stylesheets[href]==='string')collectRules(stylesheets[href],state,mediaApplies(node.attrs.media)==='conditional'?'conditional':'always');
      else if(!fontService(href))state.unchecked=true;
    }
  }
  let checks=0,exhausted=false;
  const budget={take(){if(++checks>MAX_CHECKS){exhausted=true;return false;}return true;}};
  const computed=new Map();
  for(const node of nodes){
    const parent=computed.get(node.parent)||{visibility:'visible',fontZero:false,fill:null,color:null,clipText:false};
    if(node.parent?.hidden)node.hidden=true;
    const winners=new Map(),challengers=[];
    if(!node.hidden&&!exhausted){
      const candidates=[...(state.index.get('*')||[])];
      if(node.attrs.id)candidates.push(...(state.index.get('i:'+node.attrs.id)||[]));
      for(const name of classes(node))candidates.push(...(state.index.get('c:'+name)||[]));
      candidates.push(...(state.index.get('t:'+node.name)||[]));
      for(const rule of candidates){
        if(exhausted)break;
        if(!rule.selector.match(node,budget))continue;
        for(const d of rule.decls){
          const entry={...d,spec:rule.selector.spec,order:rule.order,inline:false};
          if(rule.conditional)challengers.push(entry);
          else if(beats(entry,winners.get(d.property)))winners.set(d.property,entry);
        }
      }
      if(node.attrs.style)for(const d of declarations(String(node.attrs.style)))if(MODELED.has(d.property)){
        const entry={...d,spec:[0,0,0],order:Infinity,inline:true};
        if(beats(entry,winners.get(d.property)))winners.set(d.property,entry);
      }
    }
    // A viewport-specific rule that would override a hiding value with a
    // visible one shows the element in some layouts: do not omit it.
    const revealed=property=>challengers.some(c=>c.property===property&&beats(c,winners.get(property))&&!hidesValue(property,c.value));
    const value=property=>{const w=winners.get(property);if(!w)return null;if(unresolved.test(w.value)&&!/^(?:inherit|unset)$/.test(w.value)){if(hidingProperty(property))state.unchecked=true;return null;}return w.value;};
    const hiddenBy=property=>{const v=value(property);return v!==null&&hidesValue(property,v)&&!revealed(property);};
    let hidden=hiddenBy('display')||hiddenBy('content-visibility')||hiddenBy('opacity')||hiddenBy('text-decoration')||hiddenBy('text-decoration-line')||hiddenBy('transform')||hiddenBy('text-indent');
    const position=value('position'),overflow=[value('overflow'),value('overflow-x'),value('overflow-y')].some(v=>v==='hidden'||v==='clip');
    if(!hidden&&(hiddenBy('clip-path')&&/inset\(\s*(?:50|100)%|circle\(\s*0|polygon\(\s*0\s*0\s*,\s*0\s*0/.test(value('clip-path'))))hidden=true;
    if(!hidden&&(position==='absolute'||position==='fixed')){
      const clip=value('clip')?.match(/^rect\(\s*([-\d.]+)(?:px)?[\s,]+([-\d.]+)(?:px)?[\s,]+([-\d.]+)(?:px)?[\s,]+([-\d.]+)(?:px)?\s*\)$/);
      if(clip&&(Number(clip[3])<=Number(clip[1])||Number(clip[2])<=Number(clip[4]))&&!revealed('clip'))hidden=true;
      const w=lengthPx(value('width')||''),h=lengthPx(value('height')||'');
      if(overflow&&w!==null&&h!==null&&w<=1&&h<=1&&!revealed('width')&&!revealed('height'))hidden=true;
      const left=lengthPx(value('left')||''),top=lengthPx(value('top')||'');
      if((left!==null&&left<=-999&&!revealed('left'))||(top!==null&&top<=-999&&!revealed('top')))hidden=true;
    }
    if(!hidden&&overflow&&!revealed('overflow')&&(hiddenBy('height')||hiddenBy('max-height')||hiddenBy('width')))hidden=true;
    if(hidden)node.hidden=true;
    // Inherited properties: a child can make its own text visible again.
    const own={visibility:value('visibility'),fontSize:value('font-size'),font:value('font'),color:value('color'),fill:value('-webkit-text-fill-color')};
    const mine={...parent};
    if(own.visibility==='visible')mine.visibility='visible';else if(own.visibility&&hidesValue('visibility',own.visibility)&&!revealed('visibility'))mine.visibility='hidden';
    const sizeDecl=[['font-size',own.fontSize],['font',own.font]].filter(([,v])=>v!==null).map(([p])=>winners.get(p)).reduce((a,b)=>beats(b,a)?b:a,null);
    if(sizeDecl){
      const v=sizeDecl.value,zero=sizeDecl.property==='font'?fontShorthandZero(v):zeroLength(v);
      if(zero&&!revealed(sizeDecl.property))mine.fontZero=true;
      else if(/[\d.](?:em|%|ex|ch)$/.test(v)&&!zero)mine.fontZero=parent.fontZero;
      else if(!zero)mine.fontZero=false;
    }
    if(own.color&&own.color!=='currentcolor')mine.color=revealed('color')&&transparentColor(own.color)?'visible':own.color;
    if(own.fill&&own.fill!=='currentcolor'&&own.fill!=='initial')mine.fill=revealed('-webkit-text-fill-color')&&transparentColor(own.fill)?'visible':own.fill;
    if([value('background-clip'),value('-webkit-background-clip'),value('background')].some(v=>v&&/(?:^|\s)text(?:\s|$)/.test(v)))mine.clipText=true;
    computed.set(node,mine);
    const paint=mine.fill??mine.color;
    let textHidden=mine.visibility==='hidden'||mine.fontZero||(paint&&transparentColor(paint)&&!mine.clipText);
    // Text drawn in the same literal colour as this element's own background.
    const background=value('background-color')??(value('background')?.match(/^(#[0-9a-f]{3,8}|[a-z]+|rgba?\([^)]*\))$/)?.[1]||null);
    if(own.color&&background&&sameColor(own.color,background))textHidden=true;
    if(textHidden&&!node.hidden)node.parts=node.parts.map(part=>typeof part==='string'?' ':part);
  }
  if(exhausted)state.unchecked=true;
  return {verified:true,unchecked:state.unchecked};
}
// Only explicit visibility properties are reported when a variable or
// function leaves their value unknown; colour and size variables (for example
// Tailwind's opacity variables) are ordinary styling.
function hidingProperty(property){return ['display','visibility','opacity','content-visibility'].includes(property);}
const NAMED={white:'#ffffff',black:'#000000',red:'#ff0000',blue:'#0000ff',green:'#008000',gray:'#808080',grey:'#808080',silver:'#c0c0c0',yellow:'#ffff00',orange:'#ffa500'};
function normalColor(value){
  value=NAMED[value]||value;
  let m=value.match(/^#([0-9a-f]{3})$/);if(m)return '#'+[...m[1]].map(c=>c+c).join('');
  m=value.match(/^#([0-9a-f]{6})(?:ff)?$/);if(m)return '#'+m[1];
  m=value.match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*(?:[,/]\s*(?:1|1\.0+|100%)\s*)?\)$/);
  if(m)return '#'+m.slice(1,4).map(n=>Math.min(255,Number(n)).toString(16).padStart(2,'0')).join('');
  return null;
}
function sameColor(a,b){const x=normalColor(a),y=normalColor(b);return x!==null&&x===y;}
