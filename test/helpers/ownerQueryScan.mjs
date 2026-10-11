import {createHash} from 'node:crypto';
import {readdirSync, readFileSync} from 'node:fs';
import {join, relative} from 'node:path';
import ts from 'typescript';

const hash = text => createHash('sha256').update(text).digest('hex');

function files(directory) {
  return readdirSync(directory, {withFileTypes:true}).flatMap(entry => {
    if (entry.name === 'node_modules') return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return files(path);
    return entry.isFile() && /\.(?:js|mjs|cjs)$/.test(entry.name) ? [path] : [];
  });
}

// Keep offsets intact while hiding comments. Quoted text stays visible: even
// const method = 'prepare'; database[method](sql) must fail the inventory.
function withoutComments(source) {
  let result = '', state = 'code', escaped = false, regexClass = false, quote = null;
  for (let i = 0; i < source.length; i++) {
    const c = source[i], next = source[i+1];
    if (state === 'line') {
      if (c === '\n') { state = 'code'; result += c; }
      else result += ' ';
    } else if (state === 'block') {
      if (c === '*' && next === '/') { result += '  '; i++; state = 'code'; }
      else result += c === '\n' ? '\n' : ' ';
    } else if (state === 'string') {
      result += c;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) state = 'code';
    } else if (state === 'regex') {
      result += c;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '[') regexClass = true;
      else if (c === ']') regexClass = false;
      else if (c === '/' && !regexClass) state = 'code';
    } else if (c === '/' && next === '/') { result += '  '; i++; state = 'line'; }
    else if (c === '/' && next === '*') { result += '  '; i++; state = 'block'; }
    else if (c === '\'' || c === '"' || c === '`') { quote = c; result += c; state = 'string'; }
    else if (c === '/' && /(?:[=([{,:;!?~%^&|+*<>-]|\b(?:return|throw|case))\s*$/.test(result)) {
      result += c; state = 'regex'; regexClass = false;
    }
    else result += c;
  }
  return result;
}

function argument(source, start) {
  let depth = 1, quote = null, escaped = false, lineComment = false, blockComment = false, i = start;
  for (; i < source.length && depth; i++) {
    const c = source[i], next = source[i+1];
    if (lineComment) { if (c === '\n') lineComment = false; continue; }
    if (blockComment) { if (c === '*' && next === '/') { blockComment = false; i++; } continue; }
    if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) quote = null; continue; }
    if (c === '/' && next === '/') { lineComment = true; i++; continue; }
    if (c === '/' && next === '*') { blockComment = true; i++; continue; }
    if (c === '\'' || c === '"' || c === '`') { quote = c; continue; }
    if (c === '(') depth++;
    if (c === ')') depth--;
  }
  if (depth) throw new Error('Unbalanced prepare call');
  return source.slice(start, i-1).trim();
}

function legacyPrepareInventory(root) {
  const result = [], callOrdinals = new Map(), otherOrdinals = new Map();
  for (const path of files(join(root, 'server'))) {
    const file = relative(root, path).replaceAll('\\', '/');
    const source = readFileSync(path, 'utf8'), visible = withoutComments(source);
    const pattern = /\bprepare\b/g;
    let match;
    while ((match = pattern.exec(visible))) {
      const index = match.index, start = visible.lastIndexOf('\n', index-1)+1;
      const end = visible.indexOf('\n', index);
      const snippet = visible.slice(start, end < 0 ? visible.length : end).trim();
      const prefix = visible.slice(start, index), suffix = visible.slice(index+7);
      const direct = /\b[A-Za-z_$][\w$]*\s*(?:\?\.|\.)\s*$/.test(prefix) && /^\s*\(/.test(suffix);
      const signature = hash(direct ? argument(source, index+7+suffix.match(/^\s*\(/)[0].length) : snippet);
      const ordinals = direct ? callOrdinals : otherOrdinals;
      const key = file+'\0'+signature;
      const occurrence = (ordinals.get(key)||0)+1;
      ordinals.set(key, occurrence);
      result.push({index,method:'prepare',file, line:source.slice(0,index).split('\n').length, signature, occurrence, direct, snippet});
    }
  }
  return result;
}

// Parse property access as JavaScript: spelling scans cannot see "pre"+"pare",
// unicode escapes, dynamic keys or database aliases. Retain the existing prepare
// signatures so adding exec coverage does not silently replace reviewed entries.
export function prepareInventory(root) {
  const legacy=legacyPrepareInventory(root),result=[];
  for(const path of files(join(root,'server'))) {
    const file=relative(root,path).replaceAll('\\','/'),source=readFileSync(path,'utf8'),visible=withoutComments(source);
    const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    if(tree.parseDiagnostics.length)throw Error('Cannot inventory invalid JavaScript: '+file);
    const rows=legacy.filter(row=>row.file===file),extra=[],hidden=[],forbiddenNodes=new WeakSet();
    const declarations=new Map(),ambiguousNames=new Set(),immutableNames=new Set(),databaseNames=new Set(['database','db','applicationDb','mutex']);
    const walk=(node,visit)=>{visit(node);ts.forEachChild(node,child=>walk(child,visit));};
    const bare=node=>ts.isParenthesizedExpression(node)?bare(node.expression):node;
    function isDatabase(node){node=bare(node);return ts.isIdentifier(node)?databaseNames.has(node.text)||/database|(?:^|_)db$|Db$/.test(node.text):ts.isPropertyAccessExpression(node)&&/^(?:db|database)$/.test(node.name.text);}
    walk(tree,node=>{
      if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)){
        if(declarations.has(node.name.text)||!node.initializer||!(node.parent.flags&ts.NodeFlags.Const))ambiguousNames.add(node.name.text);
        else immutableNames.add(node.name.text);
        if(node.initializer){declarations.set(node.name.text,node.initializer);if(ts.isNewExpression(node.initializer)&&/Database|Sqlite/i.test(node.initializer.expression.getText(tree)))databaseNames.add(node.name.text);}
      }
      if((ts.isParameter(node)||ts.isBindingElement(node))&&ts.isIdentifier(node.name))ambiguousNames.add(node.name.text);
      if(ts.isPropertyAccessExpression(node)&&node.name.text==='prepare'&&ts.isIdentifier(node.expression))databaseNames.add(node.expression.text);
    });
    for(let changed=true;changed;){changed=false;for(const [name,initial] of declarations)if(!databaseNames.has(name)&&isDatabase(initial)){databaseNames.add(name);changed=true;}}
    function constant(node,seen=new Set()){
      node=bare(node);
      if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))return node.text;
      if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.PlusToken){const a=constant(node.left,seen),b=constant(node.right,seen);return typeof a==='string'&&typeof b==='string'?a+b:null;}
      if(ts.isIdentifier(node)&&immutableNames.has(node.text)&&!ambiguousNames.has(node.text)&&declarations.has(node.text)&&!seen.has(node.text))return constant(declarations.get(node.text),new Set([...seen,node.text]));
      return null;
    }
    function isRegex(node,seen=new Set()){
      node=bare(node);
      if(node.kind===ts.SyntaxKind.RegularExpressionLiteral)return true;
      if(ts.isIdentifier(node)&&immutableNames.has(node.text)&&!ambiguousNames.has(node.text)&&declarations.has(node.text)&&!seen.has(node.text))return isRegex(declarations.get(node.text),new Set([...seen,node.text]));
      return false;
    }
    function containingFunction(node){
      for(let current=node.parent;current;current=current.parent){
        if(ts.isFunctionLike(current))return current.name?.getText(tree)||((ts.isVariableDeclaration(current.parent)||ts.isPropertyAssignment(current.parent))?current.parent.name.getText(tree):'<anonymous>');
      }
      return '<module>';
    }
    function record(node,method,direct,forbidden=false){
      const index=node.getStart(tree),start=source.lastIndexOf('\n',index-1)+1,end=source.indexOf('\n',index);
      const snippet=visible.slice(start,end<0?source.length:end).trim();
      const sql=direct?source.slice(node.parent.arguments.pos,node.parent.arguments.end).trim():null;
      extra.push({file,index,line:tree.getLineAndCharacterOfPosition(index).line+1,method,direct,forbidden,
        signature:hash(direct?sql:snippet),snippet,argument:sql,function:containingFunction(node),nonDatabase:method==='exec'&&ts.isPropertyAccessExpression(node)&&isRegex(node.expression)});
    }
    function forbid(node,key,method){
      if(forbiddenNodes.has(node))return;
      forbiddenNodes.add(node);
      hidden.push([node.getStart(tree),node.end]);
      // Hide the legacy lexical finding in a referenced constant; the actual
      // forbidden access is the finding, even if the constant is on another line.
      if(key&&ts.isIdentifier(key)&&declarations.has(key.text)){const declaration=declarations.get(key.text);hidden.push([declaration.getStart(tree),declaration.end]);}
      record(node,method||'computed',false,true);
    }
    const propertyKey=name=>ts.isComputedPropertyName(name)?constant(name.expression):name.text;
    function extractedProperty(node,name,database){
      const method=propertyKey(name),computed=ts.isComputedPropertyName(name);
      if(method==='prepare'||method==='exec'||(computed&&method===null&&database))
        forbid(node,computed?name.expression:null,method);
    }
    function bindingDatabase(node){
      for(let parent=node.parent;parent;parent=parent.parent){
        if(ts.isBindingElement(parent)){
          if(parent.initializer&&isDatabase(parent.initializer))return true;
          if(parent.propertyName&&/^(?:db|database)$/.test(propertyKey(parent.propertyName)))return true;
        }else if(ts.isVariableDeclaration(parent)||ts.isParameter(parent)){
          return Boolean(parent.initializer&&isDatabase(parent.initializer));
        }else if(!ts.isObjectBindingPattern(parent)&&!ts.isArrayBindingPattern(parent))return false;
      }
      return false;
    }
    // Assignment patterns use object/array literal nodes, unlike declarations
    // and parameters. Visit only their targets: default values and ordinary
    // object literals are not method extractions. Flag the extraction itself,
    // so later direct, call, apply and bind invocations cannot hide an alias.
    function assignmentPattern(node,database=false){
      node=bare(node);
      if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsToken){
        assignmentPattern(node.left,database||isDatabase(node.right));
      }else if(ts.isObjectLiteralExpression(node)){
        for(const property of node.properties){
          if(ts.isShorthandPropertyAssignment(property)||ts.isPropertyAssignment(property)){
            extractedProperty(property,property.name,database);
            if(ts.isPropertyAssignment(property))assignmentPattern(property.initializer,/^(?:db|database)$/.test(propertyKey(property.name)));
          }else if(ts.isSpreadAssignment(property))assignmentPattern(property.expression,database);
        }
      }else if(ts.isArrayLiteralExpression(node)){
        for(const element of node.elements)assignmentPattern(ts.isSpreadElement(element)?element.expression:element,database);
      }
    }
    walk(tree,node=>{
      if(ts.isElementAccessExpression(node)){
        const name=constant(node.argumentExpression);
        if(name==='prepare'||name==='exec'||(name===null&&isDatabase(node.expression)))forbid(node,node.argumentExpression,name);
      }else if(ts.isBindingElement(node)&&ts.isObjectBindingPattern(node.parent)&&!node.dotDotDotToken){
        extractedProperty(node,node.propertyName||node.name,bindingDatabase(node));
      }else if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsToken){
        assignmentPattern(node.left,isDatabase(node.right));
      }else if((ts.isForOfStatement(node)||ts.isForInStatement(node))&&!ts.isVariableDeclarationList(node.initializer)){
        assignmentPattern(node.initializer);
      }else if(ts.isPropertyAccessExpression(node)&&['prepare','exec'].includes(node.name.text)){
        const method=node.name.text,direct=ts.isCallExpression(node.parent)&&node.parent.expression===node;
        if(method==='exec'||!rows.some(row=>row.index>=node.name.getStart(tree)&&row.index<node.name.end))record(node,method,direct);
      }
    });
    result.push(...rows.filter(row=>!hidden.some(([start,end])=>row.index>=start&&row.index<end)),...extra);
  }
  const ordinals=new Map();
  for(const row of result.sort((a,b)=>a.file.localeCompare(b.file)||a.index-b.index)){
    const key=row.file+'\0'+row.method+'\0'+row.direct+'\0'+row.signature;
    row.occurrence=(ordinals.get(key)||0)+1;ordinals.set(key,row.occurrence);
  }
  return result;
}

const entryKey=row=>row.file+'\0'+(row.method||'prepare')+'\0'+row.signature+'\0'+row.occurrence;
export function unlistedPrepares(root, exceptions, nonQueries = []) {
  const exceptionKeys = new Set(exceptions.map(entryKey));
  const nonQueryKeys = new Set(nonQueries.map(entryKey));
  return prepareInventory(root).filter(row => row.forbidden||(!row.nonDatabase&&!exceptionKeys.has(entryKey(row))&&!nonQueryKeys.has(entryKey(row))));
}
