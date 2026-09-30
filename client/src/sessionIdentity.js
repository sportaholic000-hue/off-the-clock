export function sessionClaims(token) {
  try {const claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    return claims&&typeof claims==='object'?claims:null;}catch{return null;}
}
export function sessionIdentity(token) {
  if(!token)return 'signed-out';
  const c=sessionClaims(token);
  // UI identity only; the server verifies every signature and session.
  return c&&typeof c.sub==='string'&&['owner','staff','admin'].includes(c.role)&&/^[A-Za-z0-9_-]{43}$/.test(c.sid||'')?
    JSON.stringify([c.sub,c.role,c.sid]):token;
}
