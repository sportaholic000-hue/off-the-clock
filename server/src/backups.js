import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import Database from 'better-sqlite3';
import {inside,assertRealContainment} from './deploymentConfig.js';
import {assertBackupRetentionIdle} from './backupRetentionLock.js';

const activeSnapshots=new Set();
export async function drainSnapshots(){await Promise.allSettled([...activeSnapshots]);}

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const bookName = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}\.json$/;
const bundleName = /^snapshot-\d{13}-[a-f0-9-]{36}$/;

function regularFile(root,name) {
  const file = path.resolve(root,name);
  if(!inside(root,file) || !fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) throw new Error('BACKUP_UNSAFE_FILE');
  assertRealContainment(root,file);
  return file;
}
function checkSqlite(file,{normalize=false,files}={}) {
  const db = new Database(file,{readonly:!normalize,fileMustExist:true});
  try {
    if(normalize) db.pragma('journal_mode = DELETE');
    const rows = db.pragma('integrity_check');
    if(rows.length !== 1 || Object.values(rows[0])[0] !== 'ok' || db.pragma('foreign_key_check').length) throw new Error('BACKUP_DATABASE_INVALID');
    // Platform-wide recovery inventory, not a tenant-facing query. Check the
    // copied database's ledger, so a missing source file cannot disappear from
    // the manifest and make an incomplete snapshot look verified.
    if(files && db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='priceBookCreationRecords'").get()) {
      const names=new Set(files.map(file=>file.name));
      for(const {ownerId} of db.prepare('SELECT ownerId FROM priceBookCreationRecords').all()) {
        if(!names.has('pricebooks/'+ownerId+'.json')) throw new Error('BACKUP_PRICEBOOK_MISSING');
      }
    }
  } finally {db.close();}
}
function readSourceBooks(root,directory) {
  assertRealContainment(root,directory);
  if(!fs.existsSync(directory)) return [];
  const names=fs.readdirSync(directory);
  // A marker means the last save has not been confirmed durable. Omitting it
  // would silently re-enable quoting on restore, so keep the last good backup
  // and retry only after the owner has completed a confirmed save.
  if(names.some(name=>name.endsWith('.unconfirmed'))) throw new Error('BACKUP_PRICEBOOK_UNCONFIRMED');
  return names.filter(name=>bookName.test(name)).sort().map(name=>{
    const bytes=fs.readFileSync(regularFile(directory,name));
    JSON.parse(bytes.toString('utf8'));
    return {name:'pricebooks/'+name,bytes};
  });
}
function readManifest(bundle) {
  if(!fs.lstatSync(bundle).isDirectory() || fs.lstatSync(bundle).isSymbolicLink()) throw new Error('BACKUP_UNSAFE_DIRECTORY');
  const m = JSON.parse(fs.readFileSync(regularFile(bundle,'manifest.json'),'utf8'));
  if(m.version !== 1 || !Number.isSafeInteger(m.createdAtMs) || !Array.isArray(m.files) || !m.files.length || m.files.length > 100000) throw new Error('BACKUP_MANIFEST_INVALID');
  const names = new Set();
  for(const entry of m.files) {
    if(typeof entry.name !== 'string' || !(entry.name === 'off-the-clock.sqlite' || (entry.name.startsWith('pricebooks/') && bookName.test(entry.name.slice(11)))) ||
       names.has(entry.name) || !/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0) throw new Error('BACKUP_MANIFEST_INVALID');
    names.add(entry.name);
  }
  if(!names.has('off-the-clock.sqlite')) throw new Error('BACKUP_MANIFEST_INVALID');
  return m;
}

export function verifyBackup(bundle) {
  const root = path.resolve(bundle), manifest = readManifest(root);
  for(const entry of manifest.files) {
    const bytes = fs.readFileSync(regularFile(root,entry.name));
    if(bytes.length !== entry.bytes || hash(bytes) !== entry.sha256) throw new Error('BACKUP_CHECKSUM_MISMATCH');
    if(entry.name.startsWith('pricebooks/')) JSON.parse(bytes.toString('utf8'));
  }
  checkSqlite(path.join(root,'off-the-clock.sqlite'),{files:manifest.files});
  return manifest;
}
export function listSnapshots(backupPath) {
  if(!fs.existsSync(backupPath)) return [];
  return fs.readdirSync(backupPath).filter(name=>bundleName.test(name)).flatMap(name=>{
    try {const bundle=path.join(backupPath,name),manifest=readManifest(bundle);return [{bundle,createdAtMs:manifest.createdAtMs}];}
    catch {return [];}
  }).sort((a,b)=>b.createdAtMs-a.createdAtMs);
}
function removeOwnedDirectory(parent,target) {
  const absolute = path.resolve(target), root = path.resolve(parent);
  if(absolute === root || !inside(root,absolute) || fs.lstatSync(absolute).isSymbolicLink()) throw new Error('BACKUP_UNSAFE_DELETE');
  assertRealContainment(root,absolute);
  fs.rmSync(absolute,{recursive:true,force:true});
}
export function pruneSnapshots(backupPath,{retentionDays=30,now=Date.now()}={}) {
  const snapshots = listSnapshots(backupPath);
  for(const snapshot of snapshots.slice(1)) if(snapshot.createdAtMs < now-retentionDays*86400000) removeOwnedDirectory(backupPath,snapshot.bundle);
}

export async function createSnapshot(database, config, {now = Date.now, sourceCommit = process.env.RAILWAY_GIT_COMMIT_SHA || null} = {}) {
  assertBackupRetentionIdle(config);
  let finish;const pending=new Promise(resolve=>{finish=resolve;});activeSnapshots.add(pending);
  try{return await writeSnapshot(database,config,{now,sourceCommit});}
  finally{activeSnapshots.delete(pending);finish();}
}
async function writeSnapshot(database,config,{now,sourceCommit}){
  const root = path.resolve(config.root), backupPath = path.resolve(config.backupPath);
  if(!inside(root,backupPath)) throw new Error('BACKUP_OUTSIDE_STORAGE');
  assertRealContainment(root,backupPath);
  fs.mkdirSync(backupPath,{recursive:true,mode:0o700});
  const createdAtMs = now(), id='snapshot-'+createdAtMs+'-'+randomUUID();
  const stage=path.join(backupPath,'.partial-'+id), bundle=path.join(backupPath,id);
  fs.mkdirSync(stage,{mode:0o700});
  try {
    const books = readSourceBooks(root,config.pricebookPath);
    // Online SQLite backup includes committed WAL pages. Never copy the live
    // main database file; that can omit recent commits or capture half a write.
    const sqliteFile=path.join(stage,'off-the-clock.sqlite');
    await database.backup(sqliteFile);
    assertBackupRetentionIdle(config);
    // The online copy yields. A concurrent save may have added a book or a
    // pause marker in the meantime. Never publish a mixed inventory silently.
    const currentBooks=readSourceBooks(root,config.pricebookPath);
    if(currentBooks.length!==books.length || books.some((book,index)=>book.name!==currentBooks[index].name || !book.bytes.equals(currentBooks[index].bytes))) {
      throw new Error('BACKUP_PRICEBOOK_CHANGED');
    }
    checkSqlite(sqliteFile,{normalize:true});
    fs.chmodSync(sqliteFile,0o600);
    const fd=fs.openSync(sqliteFile,'r+');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    const files=[{name:'off-the-clock.sqlite',bytes:fs.readFileSync(sqliteFile)}];
    if(books.length) fs.mkdirSync(path.join(stage,'pricebooks'),{mode:0o700});
    for(const book of books) {fs.writeFileSync(path.join(stage,book.name),book.bytes,{flag:'wx',mode:0o600,flush:true});files.push(book);}
    const manifest={version:1,createdAtMs,createdAt:new Date(createdAtMs).toISOString(),sourceCommit,
      files:files.map(file=>({name:file.name,bytes:file.bytes.length,sha256:hash(file.bytes)}))};
    fs.writeFileSync(path.join(stage,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600,flush:true});
    verifyBackup(stage);
    fs.renameSync(stage,bundle);
    pruneSnapshots(backupPath,{retentionDays:config.backupRetentionDays,now:createdAtMs});
    return bundle;
  } catch(error) {
    if(fs.existsSync(stage)) removeOwnedDirectory(backupPath,stage);
    throw error;
  }
}

export function restoreBackup(bundle, target, {volume} = {}) {
  const source=path.resolve(bundle), destination=path.resolve(target);
  if(!volume || !path.isAbsolute(volume) || path.dirname(destination) !== path.join(path.resolve(volume),'restores') || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,80}$/.test(path.basename(destination))) throw new Error('RESTORE_TARGET_OUTSIDE_VOLUME');
  assertRealContainment(volume,destination);
  if(fs.existsSync(destination)) throw new Error('RESTORE_REQUIRES_NEW_DIRECTORY');
  const manifest=verifyBackup(source);
  const parent=path.dirname(destination);
  fs.mkdirSync(parent,{recursive:true,mode:0o700});
  assertRealContainment(volume,parent);
  const stage=path.join(parent,'.restore-'+randomUUID());
  fs.mkdirSync(stage,{mode:0o700});
  try {
    for(const entry of manifest.files) {
      const bytes=fs.readFileSync(regularFile(source,entry.name));
      if(hash(bytes)!==entry.sha256 || bytes.length!==entry.bytes) throw new Error('BACKUP_CHANGED_DURING_RESTORE');
      const file=path.join(stage,entry.name);fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
      fs.writeFileSync(file,bytes,{flag:'wx',mode:0o600,flush:true});
    }
    checkSqlite(path.join(stage,'off-the-clock.sqlite'),{files:manifest.files});
    fs.renameSync(stage,destination);
    return {destination,createdAt:manifest.createdAt,sourceCommit:manifest.sourceCommit};
  } catch(error) {if(fs.existsSync(stage))removeOwnedDirectory(parent,stage);throw error;}
}

export function startBackupScheduler(database,config,{takeSnapshot=()=>createSnapshot(database,config),now=Date.now,onError=()=>console.error('[backup] BACKUP_FAILED')}={}) {
  let stopped=false,timer,active,lastSuccess=0;
  for(const snapshot of listSnapshots(config.backupPath)) {
    try {verifyBackup(snapshot.bundle);if(snapshot.createdAtMs <= now()+60000){lastSuccess=snapshot.createdAtMs;break;}} catch {}
  }
  const tick=()=>{
    if(stopped)return;
    let succeeded=false;
    active=Promise.resolve().then(takeSnapshot).then(()=>{lastSuccess=now();succeeded=true;},()=>{onError('BACKUP_FAILED');}).finally(()=>{
      active=null;
      if(!stopped){timer=setTimeout(tick,succeeded ? config.backupIntervalMs : Math.min(config.backupIntervalMs,60000));timer.unref?.();}
    });
  };
  const wait=Math.max(0,lastSuccess+config.backupIntervalMs-now());
  timer=setTimeout(tick,wait);timer.unref?.();
  return {stop:()=>{stopped=true;clearTimeout(timer);return active||Promise.resolve();},lastSuccess:()=>lastSuccess};
}
