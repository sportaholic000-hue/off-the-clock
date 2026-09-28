import { assertJsonNumberPreserved } from '../priceBookMoney.js';

// Validate wire tokens before Express discards their decimal spelling. JSON.parse
// remains the grammar authority; this scanner never rewrites a request. Strings
// (including escaped quotes, digits and keys) are consumed as a single token.
export function verifyExactJson(_req, _res, buffer, encoding) {
  if(!['utf-8','utf8'].includes((encoding||'utf-8').toLowerCase())) {
    const error=new Error('Send JSON using UTF-8 encoding.');error.status=error.statusCode=415;throw error;
  }
  let source;
  try { source=new TextDecoder('utf-8',{fatal:true}).decode(buffer); }
  catch { const error=new Error('JSON must contain valid UTF-8 text.');error.status=error.statusCode=400;throw error; }
  // TextDecoder removes a UTF-8 BOM, as Express's decoder does. Inspecting the
  // unstripped bytes would otherwise skip validation on a BOM-prefixed payload.
  try { JSON.parse(source); } catch { return; } // Express reports malformed JSON.
  const containers = [];
  const tokens = /"(?:\\[\s\S]|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\]:,]|true|false|null/g;
  for (const match of source.matchAll(tokens)) {
    const token = match[0];
    if (token === '{') containers.push(new Set());
    else if (token === '[') containers.push(null);
    else if (token === '}' || token === ']') containers.pop();
    else if (token[0] === '"') {
      let next = match.index + token.length;
      while (/\s/.test(source[next] || '') && next < source.length) next++;
      if (source[next] === ':') {
        const key = JSON.parse(token), keys = containers.at(-1);
        if (keys.has(key)) {
          const error = new Error('Duplicate JSON fields are ambiguous. Send each field once.');
          error.status = error.statusCode = 400;
          throw error;
        }
        keys.add(key);
      }
    } else if (/^-?\d/.test(token)) {
      try { assertJsonNumberPreserved(token); }
      catch (error) { error.status = error.statusCode = 400; throw error; }
    }
  }
}
