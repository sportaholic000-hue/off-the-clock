import {createHash} from 'node:crypto';
import {readdirSync, readFileSync} from 'node:fs';
import {join, relative} from 'node:path';

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

export function prepareInventory(root) {
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
      result.push({file, line:source.slice(0,index).split('\n').length, signature, occurrence, direct, snippet});
    }
  }
  return result;
}

export function unlistedPrepares(root, exceptions, nonQueries = []) {
  const exceptionKeys = new Set(exceptions.map(row => row.file+'\0'+row.signature+'\0'+row.occurrence));
  const nonQueryKeys = new Set(nonQueries.map(row => row.file+'\0'+row.signature+'\0'+row.occurrence));
  return prepareInventory(root).filter(row => {
    const key = row.file+'\0'+row.signature+'\0'+row.occurrence;
    return !exceptionKeys.has(key) && !nonQueryKeys.has(key);
  });
}
