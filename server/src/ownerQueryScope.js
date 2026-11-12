// Structural owner-scope check for SELECT, UPDATE, DELETE and WITH statements.
//
// A statement is owner-scoped only when the owner condition limits its main
// table. The condition must be a top-level AND conjunct of the WHERE clause
// (never under OR, never negated, never only inside a subquery or ON clause):
//   - main.ownerId = <parameter>   (or ownerId = <parameter> when it can only
//     name the main table), or
//   - one account row of the business: main table users with id = <parameter>
//     AND ownerId IS NULL, or id = <parameter> AND an OR group in which every
//     branch requires ownerId = <parameter> or id = <parameter>, for example
//     id = ? AND (ownerId = ? OR id = ?).
// In a JOIN, a condition that names only a joined table does not limit the main
// table. It is accepted only when the main table holds no owner data (it has no
// ownerId column) and every joined table that holds owner data is limited, by
// its own ownerId = <parameter> or by an ownerId = ownerId link to a limited
// table. Each part of a UNION/INTERSECT/EXCEPT must pass, a CTE or subquery used
// as a table must pass, and a SELECT without FROM passes only when every
// subquery in it passes.
//
// columnsOf(table) returns the table's column names, or null when unknown. Without
// it, only the main-table rules can pass.

const TERMINATORS = new Set(['WHERE','GROUP','HAVING','WINDOW','ORDER','LIMIT','UNION','INTERSECT','EXCEPT','RETURNING']);
const JOIN_WORDS = new Set(['NATURAL','LEFT','RIGHT','FULL','OUTER','INNER','CROSS','JOIN']);
const NOT_ALIAS = new Set([...TERMINATORS,...JOIN_WORDS,'ON','USING','SET','INDEXED','NOT','FROM','AS']);
const COMPOUND = new Set(['UNION','INTERSECT','EXCEPT']);

export function sqlTokens(sql) {
  const tokens = [];
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '-' && sql[i+1] === '-') { const e = sql.indexOf('\n', i); i = e < 0 ? n : e+1; continue; }
    if (c === '/' && sql[i+1] === '*') { const e = sql.indexOf('*/', i+2); i = e < 0 ? n : e+2; continue; }
    if (c === '\'') {
      let j = i+1;
      for (; j < n; j++) { if (sql[j] === '\'') { if (sql[j+1] === '\'') { j++; continue; } break; } }
      tokens.push({t:'str'}); i = j+1; continue;
    }
    if (c === '"' || c === '`' || c === '[') {
      const close = c === '[' ? ']' : c;
      let j = i+1, value = '';
      for (; j < n; j++) {
        if (sql[j] === close) { if (close !== ']' && sql[j+1] === close) { value += close; j++; continue; } break; }
        value += sql[j];
      }
      tokens.push({t:'id', v:value, quoted:true}); i = j+1; continue;
    }
    if (c === '?') { let j = i+1; while (j < n && /\d/.test(sql[j])) j++; tokens.push({t:'param'}); i = j; continue; }
    if ((c === ':' || c === '@' || c === '$') && /[A-Za-z_]/.test(sql[i+1] || '')) {
      let j = i+1; while (j < n && /\w/.test(sql[j])) j++; tokens.push({t:'param'}); i = j; continue;
    }
    if (/\d/.test(c) || (c === '.' && /\d/.test(sql[i+1] || ''))) {
      const m = /^(?:0x[0-9a-f]+|\d*\.?\d+(?:e[+-]?\d+)?)/i.exec(sql.slice(i));
      tokens.push({t:'num'}); i += m ? Math.max(1, m[0].length) : 1; continue;
    }
    if (/[A-Za-z_\u0080-￿]/.test(c)) {
      let j = i+1; while (j < n && /[\w$\u0080-￿]/.test(sql[j])) j++;
      tokens.push({t:'id', v:sql.slice(i, j), quoted:false}); i = j; continue;
    }
    const two = sql.slice(i, i+3) === '->>' ? '->>' : sql.slice(i, i+2);
    if (['->>','->','||','<=','>=','<>','!=','==','<<','>>'].includes(two)) { tokens.push({t:'op', v:two}); i += two.length; continue; }
    tokens.push({t:'op', v:c}); i++;
  }
  return tokens;
}

const word = tok => tok && tok.t === 'id' && !tok.quoted ? tok.v.toUpperCase() : null;
const isOp = (tok, v) => tok && tok.t === 'op' && tok.v === v;
const nameOf = tok => tok && tok.t === 'id' ? tok.v.toLowerCase() : null;

// Index just past the parenthesis that closes tokens[open].
function closeParen(tokens, open, end) {
  let depth = 0;
  for (let i = open; i < end; i++) {
    if (isOp(tokens[i], '(')) depth++;
    else if (isOp(tokens[i], ')') && --depth === 0) return i+1;
  }
  return -1;
}

// Depth-0 positions in [start,end) that satisfy test (parentheses only).
function topLevel(tokens, start, end, test) {
  const found = [];
  let depth = 0;
  for (let i = start; i < end; i++) {
    if (isOp(tokens[i], '(')) depth++;
    else if (isOp(tokens[i], ')')) depth--;
    else if (depth === 0 && test(tokens[i], i)) found.push(i);
  }
  return found;
}

function firstTop(tokens, start, end, words) {
  return topLevel(tokens, start, end, tok => words.has(word(tok)))[0] ?? end;
}

// Split an expression into its top-level AND conjuncts. Returns [] when the
// expression is a disjunction at its top level. A conjunct wrapped in plain
// parentheses (not a subquery) is split again.
function conjuncts(tokens, start, end) {
  if (start >= end) return [];
  const parts = [];
  let depth = 0, caseDepth = 0, between = 0, from = start;
  for (let i = start; i < end; i++) {
    const tok = tokens[i], w = word(tok);
    if (isOp(tok, '(')) depth++;
    else if (isOp(tok, ')')) depth--;
    if (depth !== 0) continue;
    if (w === 'CASE') caseDepth++;
    else if (w === 'END' && caseDepth) caseDepth--;
    if (caseDepth) continue;
    if (w === 'BETWEEN') between++;
    else if (w === 'OR') return [[start, end, true]];
    else if (w === 'AND') {
      if (between) { between--; continue; }
      parts.push([from, i]); from = i+1;
    }
  }
  parts.push([from, end]);
  const result = [];
  for (const [s, e] of parts) {
    if (isOp(tokens[s], '(') && closeParen(tokens, s, e) === e && !['SELECT','WITH','VALUES'].includes(word(tokens[s+1]))) {
      const inner = conjuncts(tokens, s+1, e-1);
      if (inner.length === 1 && inner[0][2]) result.push([s, e]);
      else result.push(...inner);
    } else result.push([s, e]);
  }
  return result.map(([s, e]) => [s, e]);
}

// Column reference at tokens[s..]: returns {qualifier, column, next} or null.
function columnRef(tokens, s, e) {
  const a = tokens[s];
  if (!a || a.t !== 'id') return null;
  if (isOp(tokens[s+1], '.') && tokens[s+2]?.t === 'id' && s+2 < e) return {qualifier:a.v.toLowerCase(), column:tokens[s+2], next:s+3};
  return {qualifier:null, column:a, next:s+1};
}
const bare = (tok, name) => tok && tok.t === 'id' && !tok.quoted && tok.v === name;
const bareCi = (tok, name) => tok && tok.t === 'id' && tok.v.toLowerCase() === name.toLowerCase();

// "<ref>.ownerId = <parameter>" exactly; returns the qualifier ('' when none).
function ownerEquality(tokens, s, e) {
  const ref = columnRef(tokens, s, e);
  if (!ref || !bare(ref.column, 'ownerId')) return null;
  if (ref.next+2 !== e || !isOp(tokens[ref.next], '=') || tokens[ref.next+1].t !== 'param') return null;
  return ref.qualifier ?? '';
}
// "<ref>.id = <parameter>" exactly.
function idEquality(tokens, s, e) {
  const ref = columnRef(tokens, s, e);
  if (!ref || !bareCi(ref.column, 'id')) return null;
  if (ref.next+2 !== e || !isOp(tokens[ref.next], '=') || tokens[ref.next+1].t !== 'param') return null;
  return ref.qualifier ?? '';
}
// "<ref>.ownerId IS NULL" exactly.
function ownerIsNull(tokens, s, e) {
  const ref = columnRef(tokens, s, e);
  if (!ref || !bare(ref.column, 'ownerId')) return null;
  if (ref.next+2 !== e || word(tokens[ref.next]) !== 'IS' || word(tokens[ref.next+1]) !== 'NULL') return null;
  return ref.qualifier ?? '';
}
// "(A OR B ...)" where every OR branch has, as one of its own top-level AND
// conditions, users.ownerId = <parameter> or users.id = <parameter>.
// isMain(qualifier, column) tells whether a reference names the main users table.
function accountOrGroup(tokens, s, e, isMain) {
  if (!isOp(tokens[s], '(') || closeParen(tokens, s, e) !== e) return false;
  const ors = topLevel(tokens, s+1, e-1, tok => word(tok) === 'OR');
  if (!ors.length) return false;
  const bounds = [s+1, ...ors.map(at => at+1)], ends = [...ors, e-1];
  return bounds.every((from, k) => {
    const branch = conjuncts(tokens, from, ends[k]);
    return branch.some(([a, b]) => {
      const owner = ownerEquality(tokens, a, b);
      if (owner !== null) return isMain(owner, 'ownerid');
      const id = idEquality(tokens, a, b);
      return id !== null && isMain(id, 'id');
    });
  });
}
// "<a>.ownerId = <b>.ownerId" exactly; returns [a, b].
function ownerLink(tokens, s, e) {
  const left = columnRef(tokens, s, e);
  if (!left || left.qualifier === null || !bare(left.column, 'ownerId') || !isOp(tokens[left.next], '=')) return null;
  const right = columnRef(tokens, left.next+1, e);
  if (!right || right.qualifier === null || !bare(right.column, 'ownerId') || right.next !== e) return null;
  return [left.qualifier, right.qualifier];
}

function parseSource(tokens, i, end, ctx) {
  const source = {kind:'table', name:null, alias:null, bound:false, on:null, using:null};
  if (isOp(tokens[i], '(')) {
    const close = closeParen(tokens, i, end);
    if (close < 0) return null;
    if (['SELECT','WITH','VALUES'].includes(word(tokens[i+1]))) { source.kind = 'sub'; source.bound = statementScoped(tokens, i+1, close-1, ctx); }
    else source.kind = 'unknown';
    i = close;
  } else if (tokens[i]?.t === 'id' && !NOT_ALIAS.has(word(tokens[i]))) {
    let name = tokens[i].v; i++;
    if (isOp(tokens[i], '.') && tokens[i+1]?.t === 'id') { name = tokens[i+1].v; i += 2; }
    source.name = name.toLowerCase();
    if (isOp(tokens[i], '(')) { const close = closeParen(tokens, i, end); if (close < 0) return null; source.kind = 'func'; i = close; }
    else if (ctx.ctes.has(source.name)) { source.kind = 'cte'; source.bound = ctx.ctes.get(source.name); }
  } else return null;
  if (word(tokens[i]) === 'AS') { if (tokens[i+1]?.t !== 'id') return null; source.alias = tokens[i+1].v.toLowerCase(); i += 2; }
  else if (tokens[i]?.t === 'id' && !NOT_ALIAS.has(word(tokens[i]))) { source.alias = tokens[i].v.toLowerCase(); i++; }
  if (word(tokens[i]) === 'INDEXED' && word(tokens[i+1]) === 'BY') i += 3;
  else if (word(tokens[i]) === 'NOT' && word(tokens[i+1]) === 'INDEXED') i += 2;
  return {source, next:i};
}

// FROM clause [start,end): array of sources, or null when it cannot be read.
function parseFrom(tokens, start, end, ctx) {
  const sources = [];
  let i = start;
  while (i < end) {
    if (sources.length) {
      if (isOp(tokens[i], ',')) i++;
      else {
        let sawJoin = false;
        while (i < end && JOIN_WORDS.has(word(tokens[i]))) { if (word(tokens[i]) === 'JOIN') sawJoin = true; i++; if (sawJoin) break; }
        if (!sawJoin) return null;
      }
    }
    const parsed = parseSource(tokens, i, end, ctx);
    if (!parsed) return null;
    i = parsed.next;
    if (word(tokens[i]) === 'ON') {
      const stop = topLevel(tokens, i+1, end, tok => isOp(tok, ',') || JOIN_WORDS.has(word(tok)))[0] ?? end;
      parsed.source.on = [i+1, stop]; i = stop;
    } else if (word(tokens[i]) === 'USING' && isOp(tokens[i+1], '(')) {
      const close = closeParen(tokens, i+1, end); if (close < 0) return null; i = close;
    }
    sources.push(parsed.source);
  }
  return sources.length ? sources : null;
}

const refName = source => source.alias ?? source.name;

function holdsOwnerData(source, ctx) {
  if (source.kind === 'func') return false;
  if (source.kind !== 'table' || !ctx.columnsOf) return true;
  const columns = ctx.columnsOf(source.name);
  if (!Array.isArray(columns) || !columns.length) return true;
  return columns.some(column => String(column).toLowerCase() === 'ownerid');
}

// Which source an unqualified column names: the main table when it is the only
// source, otherwise the single source whose known columns include it (SQLite
// refuses an ambiguous name). null when that cannot be determined.
function resolveUnqualified(sources, column, ctx) {
  if (sources.length === 1) return 0;
  if (!ctx.columnsOf) return sources[0].kind === 'table' && sources[0].name === 'users' && ['id','ownerid'].includes(column) ? 0 : null;
  const owners = [];
  for (let k = 0; k < sources.length; k++) {
    const source = sources[k];
    if (source.kind !== 'table') return null;
    const columns = ctx.columnsOf(source.name);
    if (!Array.isArray(columns) || !columns.length) return null;
    if (columns.some(name => String(name).toLowerCase() === column)) owners.push(k);
  }
  return owners.length === 1 ? owners[0] : null;
}

function sourceIndex(sources, qualifier, column, ctx) {
  if (qualifier === '') return resolveUnqualified(sources, column, ctx);
  const k = sources.findIndex(source => refName(source) === qualifier);
  return k < 0 ? null : k;
}

// sources[0] is the main table; where is the WHERE range or null.
function sourcesScoped(tokens, sources, where, ctx) {
  const parts = where ? conjuncts(tokens, where[0], where[1]) : [];
  const covered = new Set();
  let accountId = false, accountMarker = false;
  for (const [s, e] of parts) {
    const owner = ownerEquality(tokens, s, e);
    // Only a real table's ownerId counts; a subquery or CTE column could be
    // renamed, so those are limited only by passing this check themselves.
    if (owner !== null) { const k = sourceIndex(sources, owner, 'ownerid', ctx); if (k !== null && sources[k].kind === 'table') covered.add(k); continue; }
    const main = sources[0];
    if (main.kind !== 'table' || main.name !== 'users') continue;
    const id = idEquality(tokens, s, e);
    if (id !== null && sourceIndex(sources, id, 'id', ctx) === 0) { accountId = true; continue; }
    const isMain = (qualifier, column) => sourceIndex(sources, qualifier, column, ctx) === 0;
    const isNull = ownerIsNull(tokens, s, e);
    if ((isNull !== null && isMain(isNull, 'ownerid')) || accountOrGroup(tokens, s, e, isMain)) accountMarker = true;
  }
  if (accountId && accountMarker) covered.add(0);
  sources.forEach((source, k) => { if ((source.kind === 'sub' || source.kind === 'cte') && source.bound) covered.add(k); });
  if (covered.has(0)) return true;
  // Main table not limited: allowed only when it holds no owner data and every
  // joined table that does is limited directly or through an ownerId link.
  if (sources.length < 2 || holdsOwnerData(sources[0], ctx) || !covered.size) return false;
  const links = [];
  const linkRanges = [...parts, ...sources.flatMap(source => source.on ? conjuncts(tokens, source.on[0], source.on[1]) : [])];
  for (const [s, e] of linkRanges) {
    const link = ownerLink(tokens, s, e);
    if (link) { const a = sourceIndex(sources, link[0], 'ownerid', ctx), b = sourceIndex(sources, link[1], 'ownerid', ctx); if (a !== null && b !== null) links.push([a, b]); }
  }
  for (let changed = true; changed;) {
    changed = false;
    for (const [a, b] of links) {
      if (covered.has(a) && !covered.has(b) && sources[b].kind === 'table') { covered.add(b); changed = true; }
      if (covered.has(b) && !covered.has(a) && sources[a].kind === 'table') { covered.add(a); changed = true; }
    }
  }
  return sources.every((source, k) => k === 0 || covered.has(k) || !holdsOwnerData(source, ctx));
}

// Every subquery directly inside [start,end) must be scoped.
function subqueriesScoped(tokens, start, end, ctx) {
  for (let i = start; i < end; i++) {
    if (isOp(tokens[i], '(') && ['SELECT','WITH'].includes(word(tokens[i+1]))) {
      const close = closeParen(tokens, i, end);
      if (close < 0 || !statementScoped(tokens, i+1, close-1, ctx)) return false;
      i = close-1;
    }
  }
  return true;
}

function selectCoreScoped(tokens, start, end, ctx) {
  if (word(tokens[start]) === 'VALUES') return subqueriesScoped(tokens, start, end, ctx);
  if (word(tokens[start]) !== 'SELECT') return false;
  const from = topLevel(tokens, start, end, tok => word(tok) === 'FROM')[0];
  if (from === undefined) return subqueriesScoped(tokens, start, end, ctx);
  const fromEnd = firstTop(tokens, from+1, end, TERMINATORS);
  const sources = parseFrom(tokens, from+1, fromEnd, ctx);
  if (!sources) return false;
  const where = word(tokens[fromEnd]) === 'WHERE' ? [fromEnd+1, firstTop(tokens, fromEnd+1, end, TERMINATORS)] : null;
  return sourcesScoped(tokens, sources, where, ctx);
}

function compoundScoped(tokens, start, end, ctx) {
  const splits = topLevel(tokens, start, end, tok => COMPOUND.has(word(tok)));
  let from = start;
  for (const split of [...splits, end]) {
    if (!selectCoreScoped(tokens, from, split, ctx)) return false;
    from = split+1;
    if (word(tokens[from]) === 'ALL') from++;
  }
  return true;
}

function updateScoped(tokens, start, end, ctx) {
  let i = start+1;
  if (word(tokens[i]) === 'OR') i += 2;
  const target = parseSource(tokens, i, end, ctx);
  if (!target || target.source.kind !== 'table') return false;
  i = target.next;
  if (word(tokens[i]) !== 'SET') return false;
  const fromAt = topLevel(tokens, i+1, end, tok => word(tok) === 'FROM')[0];
  const whereAt = topLevel(tokens, i+1, end, tok => word(tok) === 'WHERE')[0];
  if (whereAt === undefined) return false;
  let sources = [target.source];
  if (fromAt !== undefined && fromAt < whereAt) {
    const joined = parseFrom(tokens, fromAt+1, whereAt, ctx);
    if (!joined) return false;
    sources = [target.source, ...joined];
  }
  return sourcesScoped(tokens, sources, [whereAt+1, firstTop(tokens, whereAt+1, end, new Set(['RETURNING','ORDER','LIMIT']))], ctx);
}

function deleteScoped(tokens, start, end, ctx) {
  if (word(tokens[start+1]) !== 'FROM') return false;
  const target = parseSource(tokens, start+2, end, ctx);
  if (!target || target.source.kind !== 'table' || word(tokens[target.next]) !== 'WHERE') return false;
  const where = [target.next+1, firstTop(tokens, target.next+1, end, new Set(['RETURNING','ORDER','LIMIT']))];
  return sourcesScoped(tokens, [target.source], where, ctx);
}

function insertScoped(tokens, start, end) {
  let i = start;
  if (word(tokens[i]) === 'INSERT') { i++; if (word(tokens[i]) === 'OR') i += 2; }
  else if (word(tokens[i]) === 'REPLACE') i++;
  else return false;
  if (word(tokens[i]) !== 'INTO' || tokens[i+1]?.t !== 'id') return false;
  i += 2;
  if (isOp(tokens[i], '.') && tokens[i+1]?.t === 'id') i += 2;
  if (word(tokens[i]) === 'AS') i += 2;
  if (!isOp(tokens[i], '(')) return false;
  const close = closeParen(tokens, i, end);
  if (close < 0) return false;
  for (let k = i+1; k < close-1; k++) if (tokens[k].t === 'id' && tokens[k].v === 'ownerId' && (isOp(tokens[k+1], ',') || k+1 === close-1) && (isOp(tokens[k-1], ',') || k === i+1)) return true;
  return false;
}

function statementScoped(tokens, start, end, ctx) {
  while (end > start && isOp(tokens[end-1], ';')) end--;
  let i = start;
  if (word(tokens[i]) === 'WITH') {
    const ctes = new Map(ctx.ctes);
    i++;
    if (word(tokens[i]) === 'RECURSIVE') i++;
    for (;;) {
      const name = nameOf(tokens[i]);
      if (!name) return false;
      i++;
      if (isOp(tokens[i], '(')) { i = closeParen(tokens, i, end); if (i < 0) return false; }
      if (word(tokens[i]) !== 'AS') return false;
      i++;
      if (word(tokens[i]) === 'NOT') i++;
      if (word(tokens[i]) === 'MATERIALIZED') i++;
      if (!isOp(tokens[i], '(')) return false;
      const close = closeParen(tokens, i, end);
      if (close < 0) return false;
      ctes.set(name, statementScoped(tokens, i+1, close-1, {...ctx, ctes}));
      i = close;
      if (isOp(tokens[i], ',')) { i++; continue; }
      break;
    }
    ctx = {...ctx, ctes};
  }
  const verb = word(tokens[i]);
  if (verb === 'SELECT' || verb === 'VALUES') return compoundScoped(tokens, i, end, ctx);
  if (verb === 'UPDATE') return updateScoped(tokens, i, end, ctx);
  if (verb === 'DELETE') return deleteScoped(tokens, i, end, ctx);
  if (verb === 'INSERT' || verb === 'REPLACE') return insertScoped(tokens, i, end);
  return false;
}

export function ownerScopedStatement(sql, {columnsOf = null} = {}) {
  if (typeof sql !== 'string') return false;
  const tokens = sqlTokens(sql);
  return statementScoped(tokens, 0, tokens.length, {ctes:new Map(), columnsOf});
}
