// Date.parse normalizes impossible calendar dates. Validate the literal UTC
// components by round-trip before accepting any owner-entered instant.
export function ownerUtcInstant(value) {
  const match=typeof value==='string'&&/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(value);
  if(!match)return null;
  if(/[1-9]/.test((match[2]||'').slice(3)))return null;
  const normalized=`${match[1]}.${(match[2]||'').padEnd(3,'0').slice(0,3)}Z`;
  const epoch=Date.parse(normalized);
  return Number.isFinite(epoch)&&new Date(epoch).toISOString()===normalized?normalized:null;
}
