import { DatabaseSync } from 'node:sqlite';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class DemoError extends Error { constructor(code,status=400,retryAfter=0){super(code);this.code=code;this.status=status;this.retryAfter=retryAfter;} }
export function normalizeIP(ip){
  if(typeof ip!=='string'||!isIP(ip))throw new DemoError('invalid');
  ip=ip.toLowerCase();
  if(isIP(ip)===4)return ip;
  if(ip.includes('.')){const at=ip.lastIndexOf(':'),v=ip.slice(at+1).split('.').map(Number);ip=ip.slice(0,at+1)+((v[0]<<8)|v[1]).toString(16)+':'+((v[2]<<8)|v[3]).toString(16);}
  const [l,r='']=ip.split('::');const a=l?l.split(':'):[],b=r?r.split(':'):[];
  const parts=(ip.includes('::')?[...a,...Array(8-a.length-b.length).fill('0'),...b]:a).map(x=>parseInt(x,16));
  if(parts.slice(0,5).every(x=>x===0)&&parts[5]===65535)return [parts[6]>>8,parts[6]&255,parts[7]>>8,parts[7]&255].join('.');
  // IPv6 /64 bucketing prevents trivial per-address rotation within a subnet.
  return parts.slice(0,4).map(x=>x.toString(16)).join(':')+'::/64';
}
export function clientIP(req,trusted=[]){
  const remote=req.socket.remoteAddress;
  if(!trusted.includes(remote))return normalizeIP(remote);
  const raw=req.headers['x-forwarded-for']; if(typeof raw!=='string')return normalizeIP(remote);
  const chain=raw.split(',').map(s=>s.trim());
  if(chain.length>8||chain.some(s=>!isIP(s)))throw new DemoError('invalid');
  for(let i=chain.length-1;i>=0;i--)if(!trusted.includes(chain[i]))return normalizeIP(chain[i]);
  return normalizeIP(chain[0]);
}
const day=ms=>new Date(ms).toISOString().slice(0,10);
export class Quotas {
  constructor({database=':memory:',dailyMicros,reserveMicros,maxConcurrent=10,hourlySessions=2,now=Date.now}){
    this.now=now;this.daily=dailyMicros;this.reserve=reserveMicros;this.concurrent=maxConcurrent;this.hourly=hourlySessions;
    if(database!==':memory:')mkdirSync(dirname(database),{recursive:true,mode:0o700});
    this.db=new DatabaseSync(database);this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
    this.db.exec(`CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY,v TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS usage_days(day TEXT PRIMARY KEY, charged INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS attempts(ip TEXT NOT NULL,at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS attempts_ip ON attempts(ip,at);
      CREATE TABLE IF NOT EXISTS leases(id TEXT PRIMARY KEY, expires INTEGER NOT NULL);`);
    this.db.prepare('INSERT OR IGNORE INTO meta VALUES (?,?)').run('salt',randomBytes(32).toString('hex'));
    this.salt=this.db.prepare('SELECT v FROM meta WHERE k=?').get('salt').v;
  }
  admit(ip,lifeMs){
    const n=this.now(),digest=createHmac('sha256',this.salt).update(ip).digest('hex');
    const days=[...new Set([day(n),day(n+lifeMs)])]; const id=randomUUID();
    this.db.exec('BEGIN IMMEDIATE');
    try{
      this.db.prepare('DELETE FROM attempts WHERE at<=?').run(n-3_600_000);
      this.db.prepare('DELETE FROM leases WHERE expires<=?').run(n);
      this.db.prepare('DELETE FROM usage_days WHERE day<?').run(day(n-7*86400000));
      const prev=this.db.prepare('SELECT at FROM attempts WHERE ip=? ORDER BY at').all(digest);
      if(prev.length>=this.hourly)throw new DemoError('hourly',429,Math.max(1,Math.ceil((prev[0].at+3_600_000-n)/1000)));
      if(this.db.prepare('SELECT count(*) AS n FROM leases').get().n>=this.concurrent)throw new DemoError('busy',429,10);
      for(const d of days){const used=this.db.prepare('SELECT charged FROM usage_days WHERE day=?').get(d)?.charged||0;
        if(!this.reserve||this.reserve>this.daily-used)throw new DemoError('budget',429,60);}
      // Reserve before opening the provider. No speculative refund of unknown spend.
      for(const d of days)this.db.prepare('INSERT INTO usage_days VALUES (?,?) ON CONFLICT(day) DO UPDATE SET charged=charged+excluded.charged').run(d,this.reserve);
      this.db.prepare('INSERT INTO attempts VALUES (?,?)').run(digest,n);
      this.db.prepare('INSERT INTO leases VALUES (?,?)').run(id,n+lifeMs);
      this.db.exec('COMMIT');return {id,days,reserved:this.reserve};
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  release(lease){this.db.prepare('DELETE FROM leases WHERE id=?').run(lease.id);}
  trip(lease){ // Missing/over-reservation metering blocks further admission on affected days.
    this.db.exec('BEGIN IMMEDIATE');
    try{for(const d of lease.days)this.db.prepare('INSERT INTO usage_days VALUES (?,?) ON CONFLICT(day) DO UPDATE SET charged=max(charged,excluded.charged)').run(d,this.daily);this.db.exec('COMMIT');}
    catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  active(){return this.db.prepare('SELECT count(*) AS n FROM leases WHERE expires>?').get(this.now()).n;}
  charged(date=day(this.now())){return this.db.prepare('SELECT charged FROM usage_days WHERE day=?').get(date)?.charged||0;}
  close(){this.db.close();}
}
