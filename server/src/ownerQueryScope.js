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
//
// ownerScopedStatement also requires every other business table, joined or
// inside a subquery, to be tied to the same business (businessTablesTied, below).

const TERMINATORS = new Set(['WHERE','GROUP','HAVING','WINDOW','ORDER','LIMIT','UNION','INTERSECT','EXCEPT','RETURNING']);
const JOIN_WORDS = new Set(['NATURAL','LEFT','RIGHT','FULL','OUTER','INNER','CROSS','JOIN']);
const NOT_ALIAS = new Set([...TERMINATORS,...JOIN_WORDS,'ON','USING','SET','INDEXED','NOT','FROM','AS']);
const COMPOUND = new Set(['UNION','INTERSECT','EXCEPT']);

export function sqlTokens(sql) {
  const tokens = [];
  let i = 0, anon = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '-' && sql[i+1] === '-') { const e = sql.indexOf('\n', i); i = e < 0 ? n : e+1; continue; }
    if (c === '/' && sql[i+1] === '*') { const e = sql.indexOf('*/', i+2); i = e < 0 ? n : e+2; continue; }
    if (c === '\'') {
      let j = i+1;
      for (; j < n; j++) { if (sql[j] === '\'') { if (sql[j+1] === '\'') { j++; continue; } break; } }
      tokens.push({t:'str', v:sql.slice(i+1, j).replaceAll("''", "'")}); i = j+1; continue;
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
    if (c === '?') { let j = i+1; while (j < n && /\d/.test(sql[j])) j++; const v = sql.slice(i, j); tokens.push(v === '?' ? {t:'param', v, anon:anon++} : {t:'param', v}); i = j; continue; }
    if ((c === ':' || c === '@' || c === '$') && /[A-Za-z_]/.test(sql[i+1] || '')) {
      let j = i+1; while (j < n && /\w/.test(sql[j])) j++; tokens.push({t:'param', v:sql.slice(i, j)}); i = j; continue;
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
  const source = {kind:'table', name:null, alias:null, bound:false, on:null, using:null, join:'inner', range:null};
  if (isOp(tokens[i], '(')) {
    const close = closeParen(tokens, i, end);
    if (close < 0) return null;
    if (['SELECT','WITH','VALUES'].includes(word(tokens[i+1]))) { source.kind = 'sub'; source.range = [i, close]; source.bound = statementScoped(tokens, i+1, close-1, ctx); }
    else source.kind = 'unknown';
    i = close;
  } else if (tokens[i]?.t === 'id' && !NOT_ALIAS.has(word(tokens[i]))) {
    let name = tokens[i].v, schema = null; i++;
    if (isOp(tokens[i], '.') && tokens[i+1]?.t === 'id') { schema = name; name = tokens[i+1].v; i += 2; }
    source.name = name.toLowerCase();
    if (isOp(tokens[i], '(')) { const close = closeParen(tokens, i, end); if (close < 0) return null; source.kind = 'func'; i = close; }
    // A CTE cannot be schema-qualified: main.b is the table b even inside WITH b AS (...).
    else if (schema === null && ctx.ctes.has(source.name)) { source.kind = 'cte'; source.bound = ctx.ctes.get(source.name); }
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
    let join = 'inner';
    if (sources.length) {
      if (isOp(tokens[i], ',')) i++;
      else {
        let sawJoin = false;
        const words = new Set();
        while (i < end && JOIN_WORDS.has(word(tokens[i]))) { words.add(word(tokens[i])); if (word(tokens[i]) === 'JOIN') sawJoin = true; i++; if (sawJoin) break; }
        if (!sawJoin) return null;
        join = words.has('FULL') ? 'full' : words.has('RIGHT') ? 'right' : words.has('LEFT') ? 'left' : words.has('NATURAL') ? 'natural' : 'inner';
      }
    }
    const parsed = parseSource(tokens, i, end, ctx);
    if (!parsed) return null;
    parsed.source.join = join;
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

// ---------------------------------------------------------------------------
// Every business table is tied to the same business.
//
// The check above decides whether the statement is limited by an owner
// condition on its main table. This pass adds: every table in the statement
// that holds business data must be tied to the same business, wherever it
// appears: the main table, any joined table (any join kind), a table or CTE
// used as a source, and any table inside a subquery in the select list, FROM,
// ON, WHERE, EXISTS, IN, GROUP BY, HAVING, ORDER BY, SET, VALUES or RETURNING.
//
// Which tables hold business data (tableKind):
//   - owner: the table has an ownerId column, or its columns are unknown;
//   - account: no ownerId column, but a row belongs to one user account: it has
//     a userId column (authSessions, authTokens) or a declared foreign key to
//     users or to such a table (authRefreshTokens.sessionId -> authSessions.id);
//   - unlinkable: per-account or per-call rows keyed by a keyed hash that SQL
//     cannot relate to a business (authKnownAddresses, voiceModelFailures);
//     they can never be tied, so an owner query that reaches them is refused;
//   - none: platform-wide rows with no business in them (authRateLimits,
//     voiceCircuitState, voicePlatformAlerts) and any other table without an
//     ownerId column or a user link, as in the check above.
//
// A table T is tied when one of these is an AND condition that limits T:
//   - T.ownerId = <parameter>, or T.ownerId = <owner value> either way round;
//   - for users: T.id = <owner value> (the owner's own row), or T.id = <user
//     id> of a tied account row (a user of the same business);
//   - for an account table: T.userId = <parameter>, T.userId = <owner value>
//     or <user id>, or its foreign-key column equal to the referenced column of
//     a tied row (s.id = r.sessionId where s is tied);
//   - the main users table is bound to one account row by the rule above
//     (id = <parameter> AND ownerId IS NULL, or id = <parameter> AND an OR group).
// An owner value is the ownerId column of a tied table, or the id column of a
// users row known to be the owner's own row (bound with ownerId IS NULL or
// role = 'owner'; the users CHECK constraint makes role = 'owner' rows
// ownerId IS NULL). A user id is an owner value or the id of a tied users row.
// A subquery may use the values of the statements around it (a correlated
// reference such as c.ownerId = outer.ownerId).
// Plain id/foreign-key joins between owner tables (c.id = b.customerId) do not
// tie: their foreign keys name only the id column, so they do not make the
// referenced row the same business's row.
// A condition limits T when it is a top-level AND condition of the WHERE clause,
// or of the ON clause of T's own INNER/CROSS/LEFT join, or of the ON clause of a
// later INNER/CROSS join (all rows that join must satisfy it), or of the ON
// clause of a later RIGHT join (it limits the tables on the left). A FULL or
// NATURAL join's ON/USING ties nothing. Comparisons use = only, so a NULL from
// an outer join never matches.
// A schema-qualified name (main.b, temp.b) is always the table, never a CTE.
//
// Owner parameters: every parameter that ties a table to the owner (ownerId =
// <parameter>, userId = <parameter>, and the id of the owner's own users row)
// must carry the same business. Named or numbered owner parameters must all be
// the same one. When two or more different parameters tie tables (for example
// two positional ?), the SQL text cannot show they carry the same value, so the
// result names them (ownerParameters) and the helper checks the bound values
// are equal each time the statement runs.
//
// Writes that could reach another business's row:
//   - INSERT ... ON CONFLICT(target) DO UPDATE on an owner table needs ownerId
//     in the conflict target, or a DO UPDATE WHERE condition
//     <target>.ownerId = excluded.ownerId;
//   - INSERT OR REPLACE, REPLACE INTO and UPDATE OR REPLACE on an owner table
//     need ownerId in every unique key of that table (REPLACE deletes the row
//     that holds a conflicting key, whatever business it belongs to).

const GLOBAL_TABLES = new Set(['authratelimits','voicecircuitstate','voiceplatformalerts']);
const UNLINKABLE_TABLES = new Set(['authknownaddresses','voicemodelfailures']);
const foreignKeysOf = (name, ctx) => { const list = ctx.columnsOf?.foreignKeys?.(name); return Array.isArray(list) ? list : []; };
function kindOfTable(name, ctx, seen = new Set()) {
  const columns = ctx.columnsOf ? ctx.columnsOf(name) : null;
  if (!Array.isArray(columns) || !columns.length) return 'owner';
  const lower = columns.map(column => String(column).toLowerCase());
  if (lower.includes('ownerid')) return 'owner';
  if (GLOBAL_TABLES.has(name)) return 'none';
  if (UNLINKABLE_TABLES.has(name)) return 'unlinkable';
  if (lower.includes('userid')) return 'account';
  if (seen.has(name)) return 'none';
  seen.add(name);
  return foreignKeysOf(name, ctx).some(fk => fk.table === 'users' || kindOfTable(fk.table, ctx, seen) === 'account') ? 'account' : 'none';
}
const tableKind = (source, ctx) => source.kind === 'table' ? kindOfTable(source.name, ctx) : 'none';
function uniqueKeysIncludeOwner(name, ctx) {
  const keys = ctx.columnsOf?.uniqueKeys?.(name);
  return Array.isArray(keys) && keys.every(key => key.includes('ownerid'));
}

function linkRefs(tokens, s, e) {
  const left = columnRef(tokens, s, e);
  if (!left || !isOp(tokens[left.next], '=')) return null;
  const right = columnRef(tokens, left.next+1, e);
  if (!right || right.next !== e) return null;
  return [left, right];
}

// Find the scope and source a column reference names; null when unknown.
function resolveRef(scope, ref, ctx) {
  const column = ref.column.v.toLowerCase();
  if (ref.qualifier === null) {
    const k = resolveUnqualified(scope.sources, column, ctx);
    return k === null || !scope.sources.length ? null : {scope, k, column};
  }
  for (let level = scope; level; level = level.parent) {
    const k = level.sources.findIndex(source => refName(source) === ref.qualifier);
    if (k >= 0) return {scope:level, k, column};
  }
  return null;
}

const ownerValue = hit => hit.scope.owner.has(hit.k+':'+hit.column);
const userValue = hit => ownerValue(hit) || hit.scope.user.has(hit.k+':'+hit.column);
const newScope = (sources, parent) => ({sources, parent, tied:new Set(), owner:new Set(), user:new Set()});

// Which sources a condition in the ON clause of sources[at] may limit.
function onLimits(sources, at) {
  const join = sources[at].join;
  if (join === 'inner') return k => k <= at;
  if (join === 'left') return k => k === at;
  if (join === 'right') return k => k < at;
  return () => false;
}

// "<ref>.userId = <parameter>" exactly; returns the qualifier ('' when none).
function userIdEquality(tokens, s, e) {
  const ref = columnRef(tokens, s, e);
  if (!ref || !bareCi(ref.column, 'userId')) return null;
  if (ref.next+2 !== e || !isOp(tokens[ref.next], '=') || tokens[ref.next+1].t !== 'param') return null;
  return ref.qualifier ?? '';
}

function computeTies(tokens, scope, where, ctx) {
  const {sources} = scope;
  const conditions = [];
  if (where) for (const range of conjuncts(tokens, where[0], where[1])) conditions.push({range, may:() => true, where:true});
  sources.forEach((source, at) => {
    if (at && source.on) for (const range of conjuncts(tokens, source.on[0], source.on[1])) conditions.push({range, may:onLimits(sources, at), where:false});
  });
  // Tie source k. ownerColumn/userColumn name a column of k that now carries the
  // owner ID or a user ID of the business.
  const tie = (k, {owner = null, user = null} = {}) => {
    let changed = false;
    const add = (set, key) => { if (!set.has(key)) { set.add(key); changed = true; } };
    if (!scope.tied.has(k)) { scope.tied.add(k); changed = true; }
    if (owner) add(scope.owner, k+':'+owner);
    if (user) add(scope.user, k+':'+user);
    if (sources[k].name === 'users') add(scope.user, k+':id');
    if (kindOfTable(sources[k].name, ctx) === 'owner' && sources[k].name !== 'users') add(scope.owner, k+':ownerid');
    return changed;
  };
  // The main users table bound to one account row (same forms as the check above).
  const main = sources[0];
  if (main && main.kind === 'table' && main.name === 'users' && where) {
    let accountId = null, marker = false, ownRow = false;
    const isMain = (qualifier, column) => sourceIndex(sources, qualifier, column, ctx) === 0;
    for (const [s, e] of conjuncts(tokens, where[0], where[1])) {
      const id = idEquality(tokens, s, e);
      if (id !== null && isMain(id, 'id')) { accountId = tokens[e-1]; continue; }
      const isNull = ownerIsNull(tokens, s, e);
      if (isNull !== null && isMain(isNull, 'ownerid')) { marker = true; ownRow = true; continue; }
      if (accountOrGroup(tokens, s, e, isMain)) { marker = true; continue; }
      const ref = columnRef(tokens, s, e);
      if (ref && bareCi(ref.column, 'role') && isMain(ref.qualifier ?? '', 'role') && ref.next+2 === e && isOp(tokens[ref.next], '=') &&
        tokens[ref.next+1].t === 'str' && tokens[ref.next+1].v === 'owner') ownRow = true;
    }
    if (accountId !== null && marker) {
      tie(0, {owner:ownRow ? 'id' : null});
      ctx.namedParams.push(accountId);
      if (ownRow) ctx.ownerParams.push(accountId);
    }
  }
  for (let changed = true; changed;) {
    changed = false;
    for (const {range:[s, e], may} of conditions) {
      const owner = ownerEquality(tokens, s, e);
      if (owner !== null) {
        const k = sourceIndex(sources, owner, 'ownerid', ctx);
        if (k !== null && may(k) && sources[k].kind === 'table') {
          changed = tie(k, {owner:'ownerid'}) || changed;
          if (!tokens[e-1].counted) { tokens[e-1].counted = true; ctx.ownerParams.push(tokens[e-1]); ctx.namedParams.push(tokens[e-1]); }
        }
        continue;
      }
      const userId = userIdEquality(tokens, s, e);
      if (userId !== null) {
        const k = sourceIndex(sources, userId, 'userid', ctx);
        if (k !== null && may(k) && tableKind(sources[k], ctx) === 'account') {
          changed = tie(k, {user:'userid'}) || changed;
          if (!tokens[e-1].counted) { tokens[e-1].counted = true; ctx.ownerParams.push(tokens[e-1]); ctx.namedParams.push(tokens[e-1]); }
        }
        continue;
      }
      const link = linkRefs(tokens, s, e);
      if (!link) continue;
      const [a, b] = link.map(ref => resolveRef(scope, ref, ctx));
      if (!a || !b) continue;
      for (const [known, other] of [[a, b], [b, a]]) {
        if (other.scope !== scope || !may(other.k) || sources[other.k].kind !== 'table') continue;
        const target = sources[other.k], kind = tableKind(target, ctx);
        if (other.column === 'ownerid' && ownerValue(known)) changed = tie(other.k, {owner:'ownerid'}) || changed;
        else if (target.name === 'users' && other.column === 'id' && ownerValue(known)) changed = tie(other.k, {owner:'id'}) || changed;
        else if (target.name === 'users' && other.column === 'id' && userValue(known)) changed = tie(other.k) || changed;
        else if (kind === 'account' && other.column === 'userid' && userValue(known)) changed = tie(other.k, {user:'userid'}) || changed;
        else if (kind === 'account' && known.scope.tied.has(known.k)) {
          const from = known.scope.sources[known.k];
          if (from.kind === 'table' && foreignKeysOf(target.name, ctx).some(fk => fk.from === other.column && fk.table === from.name && fk.to === known.column))
            changed = tie(other.k) || changed;
        }
      }
    }
  }
}

function sourceTied(scope, k, ctx) {
  const source = scope.sources[k];
  if (scope.tied.has(k)) return true;
  if (source.kind === 'sub' || source.kind === 'cte') return true; // checked as statements of their own
  return tableKind(source, ctx) === 'none';
}

// Every subquery in [start,end), except FROM sources (checked by the caller).
function subqueriesTied(tokens, start, end, ctx, scope, skip = new Set()) {
  for (let i = start; i < end; i++) {
    if (isOp(tokens[i], '(') && ['SELECT','WITH','VALUES'].includes(word(tokens[i+1]))) {
      const close = closeParen(tokens, i, end);
      if (close < 0) return false;
      if (!skip.has(i) && !statementTied(tokens, i+1, close-1, ctx, scope)) return false;
      i = close-1;
    }
  }
  return true;
}

function scopeTied(tokens, sources, where, start, end, ctx, outer) {
  const scope = newScope(sources, outer);
  const skip = new Set();
  for (const source of sources) {
    if (source.kind === 'unknown') return false;
    if (source.kind === 'sub') {
      if (!statementTied(tokens, source.range[0]+1, source.range[1]-1, ctx, null)) return false;
      skip.add(source.range[0]);
    }
  }
  computeTies(tokens, scope, where, ctx);
  if (!sources.every((source, k) => sourceTied(scope, k, ctx))) return false;
  return subqueriesTied(tokens, start, end, ctx, scope, skip);
}

function selectCoreTied(tokens, start, end, ctx, outer) {
  if (word(tokens[start]) === 'VALUES') return subqueriesTied(tokens, start, end, ctx, outer ?? newScope([], null));
  if (word(tokens[start]) !== 'SELECT') return false;
  const from = topLevel(tokens, start, end, tok => word(tok) === 'FROM')[0];
  if (from === undefined) return scopeTied(tokens, [], null, start, end, ctx, outer);
  const fromEnd = firstTop(tokens, from+1, end, TERMINATORS);
  const sources = parseFrom(tokens, from+1, fromEnd, ctx);
  if (!sources) return false;
  const where = word(tokens[fromEnd]) === 'WHERE' ? [fromEnd+1, firstTop(tokens, fromEnd+1, end, TERMINATORS)] : null;
  return scopeTied(tokens, sources, where, start, end, ctx, outer);
}

// The column names of a parenthesized list at tokens[open] (first word of each item).
function columnList(tokens, open, end) {
  const close = closeParen(tokens, open, end);
  if (close < 0) return null;
  const names = [];
  let first = true;
  for (let i = open+1; i < close-1; i++) {
    if (isOp(tokens[i], '(')) { i = closeParen(tokens, i, close)-1; continue; }
    if (isOp(tokens[i], ',')) { first = true; continue; }
    if (first && tokens[i].t === 'id') names.push(tokens[i].v.toLowerCase());
    first = false;
  }
  return {names, close};
}

// Each ON CONFLICT ... DO UPDATE of an INSERT into an owner table keeps the
// update on this business's row.
function upsertsGuarded(tokens, start, end, table, alias) {
  const clauses = topLevel(tokens, start, end, (tok, at) => word(tok) === 'ON' && word(tokens[at+1]) === 'CONFLICT');
  const bounds = [...clauses.slice(1), topLevel(tokens, start, end, tok => word(tok) === 'RETURNING')[0] ?? end];
  return clauses.every((at, n) => {
    const stop = Math.min(bounds[n], end);
    let i = at+2, target = [];
    if (isOp(tokens[i], '(')) { const list = columnList(tokens, i, stop); if (!list) return false; target = list.names; i = list.close; }
    const doAt = topLevel(tokens, i, stop, tok => word(tok) === 'DO')[0];
    if (doAt === undefined) return false;
    if (word(tokens[doAt+1]) === 'NOTHING') return true;
    if (word(tokens[doAt+1]) !== 'UPDATE') return false;
    if (target.includes('ownerid')) return true;
    const whereAt = topLevel(tokens, doAt+2, stop, tok => word(tok) === 'WHERE')[0];
    if (whereAt === undefined) return false;
    return conjuncts(tokens, whereAt+1, stop).some(([s, e]) => {
      const link = linkRefs(tokens, s, e);
      if (!link || !link.every(ref => bareCi(ref.column, 'ownerId'))) return false;
      const sides = link.map(ref => ref.qualifier);
      return sides.includes('excluded') && sides.some(side => side === null || side === table || side === alias);
    });
  });
}

// Token ranges of the value at column position n of each inserted row:
// each VALUES row, or the select list of the first SELECT that supplies rows.
function insertedItems(tokens, start, end, n) {
  const items = (from, to) => {
    const commas = topLevel(tokens, from, to, tok => isOp(tok, ','));
    const bounds = [from, ...commas.map(at => at+1)], ends = [...commas, to];
    return n < bounds.length ? [[bounds[n], ends[n]]] : [];
  };
  let i = start;
  if (word(tokens[i]) === 'VALUES') {
    const found = [];
    for (i++; isOp(tokens[i], '(');) {
      const close = closeParen(tokens, i, end);
      if (close < 0) return found;
      found.push(...items(i+1, close-1));
      i = close;
      if (!isOp(tokens[i], ',')) break;
      i++;
    }
    return found;
  }
  if (word(tokens[i]) !== 'SELECT') return [];
  i++;
  if (['DISTINCT','ALL'].includes(word(tokens[i]))) i++;
  const stop = topLevel(tokens, i, end, tok => word(tok) === 'FROM' || TERMINATORS.has(word(tok)))[0] ?? end;
  return items(i, stop);
}

function statementTied(tokens, start, end, ctx, outer) {
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
      ctes.set(name, true);
      if (!statementTied(tokens, i+1, close-1, {...ctx, ctes}, null)) return false;
      i = close;
      if (isOp(tokens[i], ',')) { i++; continue; }
      break;
    }
    ctx = {...ctx, ctes};
  }
  const verb = word(tokens[i]);
  if (verb === 'SELECT' || verb === 'VALUES') {
    const splits = topLevel(tokens, i, end, tok => COMPOUND.has(word(tok)));
    let from = i;
    for (const split of [...splits, end]) {
      if (!selectCoreTied(tokens, from, split, ctx, outer)) return false;
      from = split+1;
      if (word(tokens[from]) === 'ALL') from++;
    }
    return true;
  }
  if (verb === 'UPDATE') {
    let k = i+1, replace = false;
    if (word(tokens[k]) === 'OR') { replace = word(tokens[k+1]) === 'REPLACE'; k += 2; }
    const target = parseSource(tokens, k, end, ctx);
    if (!target || target.source.kind !== 'table' || word(tokens[target.next]) !== 'SET') return false;
    if (replace && tableKind(target.source, ctx) === 'owner' && !uniqueKeysIncludeOwner(target.source.name, ctx)) return false;
    const fromAt = topLevel(tokens, target.next+1, end, tok => word(tok) === 'FROM')[0];
    const whereAt = topLevel(tokens, target.next+1, end, tok => word(tok) === 'WHERE')[0];
    if (whereAt === undefined) return false;
    let sources = [target.source];
    if (fromAt !== undefined && fromAt < whereAt) {
      const joined = parseFrom(tokens, fromAt+1, whereAt, ctx);
      if (!joined) return false;
      sources = [target.source, ...joined];
    }
    const where = [whereAt+1, firstTop(tokens, whereAt+1, end, new Set(['RETURNING','ORDER','LIMIT']))];
    return scopeTied(tokens, sources, where, i, end, ctx, outer);
  }
  if (verb === 'DELETE') {
    if (word(tokens[i+1]) !== 'FROM') return false;
    const target = parseSource(tokens, i+2, end, ctx);
    if (!target || target.source.kind !== 'table' || word(tokens[target.next]) !== 'WHERE') return false;
    const where = [target.next+1, firstTop(tokens, target.next+1, end, new Set(['RETURNING','ORDER','LIMIT']))];
    return scopeTied(tokens, [target.source], where, i, end, ctx, outer);
  }
  if (verb === 'INSERT' || verb === 'REPLACE') {
    // The inserted row names its owner (checked elsewhere). A SELECT that
    // supplies the rows, and every subquery, must tie its own tables; none can
    // lean on the target row, so an upsert subquery that does is refused.
    let k = i+1, replace = verb === 'REPLACE';
    if (verb === 'INSERT' && word(tokens[k]) === 'OR') { replace = word(tokens[k+1]) === 'REPLACE'; k += 2; }
    if (word(tokens[k]) !== 'INTO' || tokens[k+1]?.t !== 'id') return false;
    let table = tokens[k+1].v.toLowerCase(); k += 2;
    if (isOp(tokens[k], '.') && tokens[k+1]?.t === 'id') { table = tokens[k+1].v.toLowerCase(); k += 2; }
    const alias = word(tokens[k]) === 'AS' && tokens[k+1]?.t === 'id' ? tokens[k+1].v.toLowerCase() : null;
    const ownerTable = kindOfTable(table, ctx) === 'owner';
    if (replace && ownerTable && !uniqueKeysIncludeOwner(table, ctx)) return false;
    let open = k;
    while (open < end && !isOp(tokens[open], '(')) open++;
    if (open >= end) return false;
    const close = closeParen(tokens, open, end);
    if (close < 0) return false;
    if (ownerTable && !upsertsGuarded(tokens, close, end, table, alias)) return false;
    // The inserted ownerId value joins the owner parameters when it is a
    // parameter, so a SELECT or subquery tied by another parameter must carry
    // the same business.
    const ownerColumn = columnList(tokens, open, end)?.names.indexOf('ownerid') ?? -1;
    if (ownerColumn >= 0) for (const item of insertedItems(tokens, close, end, ownerColumn))
      if (item[1] === item[0]+1 && tokens[item[0]].t === 'param') { ctx.ownerParams.push(tokens[item[0]]); ctx.namedParams.push(tokens[item[0]]); }
    const empty = newScope([], null);
    if (['SELECT','WITH'].includes(word(tokens[close]))) {
      const tail = topLevel(tokens, close, end, (tok, at) => (word(tok) === 'ON' && word(tokens[at+1]) === 'CONFLICT') || word(tok) === 'RETURNING')[0] ?? end;
      if (!statementTied(tokens, close, tail, ctx, null)) return false;
      return subqueriesTied(tokens, tail, end, ctx, empty);
    }
    return subqueriesTied(tokens, close, end, ctx, empty);
  }
  return false;
}

// The tie pass. Returns null when a business table is not tied (or a write
// could reach another business's row); otherwise {ownerParameters}, which is
// null when one parameter (or none) carries the owner, or the parameters whose
// bound values must be equal: {anonymous:[0-based positions of ? among the
// unnamed parameters], named:[names without their @ : $ prefix]}.
export function businessTieAnalysis(sql, {columnsOf = null} = {}) {
  if (typeof sql !== 'string') return null;
  const tokens = sqlTokens(sql);
  const ctx = {ctes:new Map(), columnsOf, ownerParams:[], namedParams:[]};
  if (!statementTied(tokens, 0, tokens.length, ctx, null)) return null;
  if (new Set(ctx.namedParams.map(tok => tok.v).filter(v => v !== '?')).size > 1) return null;
  const identities = new Map();
  for (const tok of ctx.ownerParams) identities.set(tok.v === '?' ? '?'+tok.anon : tok.v, tok);
  if (identities.size < 2) return {ownerParameters:null};
  const anonymous = [], named = [];
  for (const tok of identities.values()) {
    if (tok.v === '?') anonymous.push(tok.anon);
    else if (/^\?\d/.test(tok.v)) return null; // numbered parameters are not bound by name or position here
    else named.push(tok.v.slice(1));
  }
  // Numbered parameters elsewhere would shift which values the unnamed ? take.
  if (anonymous.length && tokens.some(tok => tok.t === 'param' && /^\?\d/.test(tok.v))) return null;
  return {ownerParameters:{anonymous, named}};
}

// Every business table in the statement is tied to the same business.
export function businessTablesTied(sql, {columnsOf = null} = {}) {
  return businessTieAnalysis(sql, {columnsOf}) !== null;
}

// The owner condition limits the main table (the rules at the top of this file).
export function mainTableScoped(sql, {columnsOf = null} = {}) {
  if (typeof sql !== 'string') return false;
  const tokens = sqlTokens(sql);
  return statementScoped(tokens, 0, tokens.length, {ctes:new Map(), columnsOf});
}

// Both parts: the main table is limited and every business table is tied.
export function ownerScopedStatement(sql, {columnsOf = null} = {}) {
  return mainTableScoped(sql, {columnsOf}) && businessTablesTied(sql, {columnsOf});
}
