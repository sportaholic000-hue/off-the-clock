// Deliberately bounded static visibility. The importer supplies same-host CSS
// under its existing network budgets; scripts and other resources stay unfetched.
// Unsupported visibility dependencies cause
// an incomplete import, never an assumption that their prices are visible.
const ident='[a-zA-Z_][a-zA-Z0-9_-]*';
const supportedProperties=new Set(['display','visibility','opacity','content-visibility','text-decoration','text-decoration-line',
  'clip','clip-path','mask','mask-image','filter','transform','translate','scale','animation','animation-name','text-indent',
  'position','overflow','overflow-x','overflow-y','width','height','max-width','max-height','font-size','color','-webkit-text-fill-color']);
function compound(source){
  const tests=[];let rest=source;
  const tag=rest.match(/^(?:[a-zA-Z][a-zA-Z0-9_-]*|\*)/);
  if(tag){if(tag[0]!=='*')tests.push(node=>node.name===tag[0].toLowerCase());rest=rest.slice(tag[0].length);}
  while(rest){
    const simple=rest.match(new RegExp('^([.#])('+ident+')'));
    if(simple){tests.push(simple[1]==='#'?node=>node.attrs.id===simple[2]:node=>(node.attrs.class||'').split(/\s+/).includes(simple[2]));rest=rest.slice(simple[0].length);continue;}
    const attr=rest.match(/^\[([a-zA-Z_][\w-]*)(?:=(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([\w-]+)))?\]/);
    if(attr){const name=attr[1].toLowerCase(),value=attr[2]??attr[3]??attr[4];tests.push(node=>value===undefined?Object.hasOwn(node.attrs,name):node.attrs[name]===value);rest=rest.slice(attr[0].length);continue;}
    throw new TypeError('Unsupported visibility selector.');
  }
  if(!tests.length)throw new TypeError('Empty visibility selector.');
  return node=>node?.attrs&&tests.every(test=>test(node));
}
function selector(source){
  const tokens=source.trim().replace(/\s*>\s*/g,' > ').split(/\s+/);
  if(!tokens.length||tokens.length>32||tokens[0]==='>'||tokens.at(-1)==='>')throw new TypeError('Unbounded visibility selector.');
  const parts=[];
  for(let i=0;i<tokens.length;i++){
    if(tokens[i]==='>')throw new TypeError('Invalid visibility selector.');
    parts.push({test:compound(tokens[i]),direct:i>0&&tokens[i-1]==='>'});
    if(tokens[i+1]==='>')i++;
  }
  return node=>{
    let cursor=node,index=parts.length-1;if(!parts[index].test(cursor))return false;
    while(index>0){const direct=parts[index].direct;index--;cursor=cursor.parent;
      if(direct){if(!parts[index].test(cursor))return false;}
      else{while(cursor&&!parts[index].test(cursor))cursor=cursor.parent;if(!cursor)return false;}
    }return true;
  };
}
function declarations(source){
  if(/[\\{}@]/.test(source))throw new TypeError('Unsupported visibility dependency.');
  let hidden=false;
  for(const declaration of source.split(';')){
    if(!declaration.trim())continue;const colon=declaration.indexOf(':');
    if(colon<0)throw new TypeError('Malformed stylesheet.');
    const property=declaration.slice(0,colon).trim().toLowerCase(),value=declaration.slice(colon+1).trim().toLowerCase().replace(/\s*!important\s*$/,'');
    // Custom properties alone do not style anything. Their use requires CSS
    // variable resolution, which is deliberately not guessed by this importer.
    if(property.startsWith('--'))continue;
    if(!supportedProperties.has(property)||/var\(|env\(|calc\(/.test(value))throw new TypeError('Unresolved style property.');
    if(['display','visibility','opacity','content-visibility'].includes(property)){
      if(/var\(|env\(|calc\(|inherit|revert|unset/.test(value))throw new TypeError('Unresolved visibility value.');
      if(property==='display'&&value==='none'||property==='visibility'&&['hidden','collapse'].includes(value)||property==='content-visibility'&&value==='hidden'||property==='opacity'&&/^(?:0+(?:\.0+)?|0%)$/.test(value))hidden=true;
      else if(property==='display'&&!/^(?:block|inline|inline-block|flex|inline-flex|grid|inline-grid|table|table-row|table-cell|table-row-group|table-header-group|table-footer-group|list-item|contents|flow-root|initial)$/.test(value)||property==='visibility'&&!/^(?:visible|initial)$/.test(value)||property==='opacity'&&!/^(?:0?\.\d+|1(?:\.0+)?|(?:[1-9]\d?|100)%)$/.test(value)||property==='content-visibility'&&!/^(?:visible|auto|initial)$/.test(value))throw new TypeError('Unknown visibility value.');
    }
    if(['text-decoration','text-decoration-line'].includes(property)&&value.includes('line-through'))hidden=true;
    if(['clip','clip-path','mask','mask-image','filter','transform','translate','scale','animation','animation-name','text-indent'].includes(property)&&!['none','auto','initial','0'].includes(value))hidden=true;
    if(['position'].includes(property)&&['absolute','fixed'].includes(value))hidden=true;
    if(['overflow','overflow-x','overflow-y'].includes(property)&&['hidden','clip'].includes(value))hidden=true;
    if(['width','height','max-width','max-height','font-size'].includes(property)&&/^(?:0+(?:\.0+)?|\.0+)(?:px|em|rem|%|pt)?$/.test(value))hidden=true;
    if(['color','-webkit-text-fill-color'].includes(property)){
      if(/transparent|^#[0-9a-f]{3}0$|^#[0-9a-f]{6}00$|(?:rgba?|hsla?)\([^)]*[,/]\s*0(?:\.0+)?%?\s*\)/.test(value))hidden=true;
      else throw new TypeError('Foreground/background contrast is unresolved.');
    }
  }return hidden;
}
export function applyWebsiteVisibility(nodes,{stylesheets={}}={}){
  let checks=0;
  const stylesheetLinks=nodes.filter(node=>node.name==='link'&&(node.attrs.rel||'').toLowerCase().split(/\s+/).includes('stylesheet')).map(node=>node.attrs.href).filter(Boolean);
  try{
    if(stylesheetLinks.some(href=>typeof stylesheets[href]!=='string'))throw new TypeError('External stylesheet visibility is unverified.');
    const rules=[];
    const sources=[...nodes,...stylesheetLinks.map(href=>({name:'style',attrs:{},parts:[stylesheets[href]]}))];
    for(const node of sources){
      if(node.attrs.style&&declarations(node.attrs.style))node.hidden=true;
      if(node.name!=='style')continue;
      let css=node.parts.filter(value=>typeof value==='string').join('').replace(/\/\*[\s\S]*?\*\//g,'').trim();
      if(css.length>65536||/[\\@]/.test(css))throw new TypeError('Unresolved stylesheet.');
      const block=/([^{}]+)\{([^{}]*)\}/g;let match,end=0;
      while((match=block.exec(css))){
        if(css.slice(end,match.index).trim())throw new TypeError('Nested or malformed stylesheet.');end=block.lastIndex;
        if(declarations(match[2]))for(const part of match[1].split(',')){
          if(rules.length>=100)throw new TypeError('Too many visibility rules.');rules.push(selector(part));
        }
      }
      if(css.slice(end).trim())throw new TypeError('Incomplete stylesheet.');
    }
    for(const node of nodes){
      if(node.parent.hidden)node.hidden=true;
      if(node.hidden)continue;
      for(const matches of rules){if(++checks>1000000)throw new TypeError('Visibility evaluation exceeds budget.');if(matches(node)){node.hidden=true;break;}}
    }
    return {verified:true};
  }catch{return {verified:false,stylesheetLinks};}
}
