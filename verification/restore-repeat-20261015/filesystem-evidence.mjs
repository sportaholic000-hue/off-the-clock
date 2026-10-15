import {createHash} from 'node:crypto';
import {lstat, readFile, readdir, readlink} from 'node:fs/promises';
import path from 'node:path';

const hash = value => createHash('sha256').update(value).digest('hex');
const root = path.resolve(process.argv[2]);
const mode = process.argv[3];

async function describe(absolute, relative) {
  try {
    const stat = await lstat(absolute);
    const common = {
      path: relative,
      inode: Number(stat.ino),
      size: Number(stat.size),
      mtimeMs: stat.mtimeMs,
      mtimeUTC: stat.mtime.toISOString()
    };
    if (stat.isFile()) return {...common, type: 'file', sha256: hash(await readFile(absolute))};
    if (stat.isSymbolicLink()) {
      const target = await readlink(absolute);
      return {...common, type: 'symlink', target, sha256: hash(Buffer.from(target))};
    }
    if (stat.isDirectory()) return {...common, type: 'directory'};
    return {...common, type: 'other'};
  } catch (error) {
    return {path: relative, type: 'missing', error: String(error?.code || error)};
  }
}

async function inventory() {
  const entries = [];
  async function walk(absolute, relative) {
    for (const name of (await readdir(absolute)).sort()) {
      const childAbsolute = path.join(absolute, name);
      const childRelative = relative ? path.posix.join(relative, name) : name;
      const row = await describe(childAbsolute, childRelative);
      entries.push(row);
      if (row.type === 'directory') await walk(childAbsolute, childRelative);
    }
  }
  await walk(root, '');
  return {root, observedUTC: new Date().toISOString(), entries};
}

async function manifest() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const paths = JSON.parse(input);
  const entries = [];
  for (const relative of paths) entries.push(await describe(path.join(root, relative), relative));
  return {root, observedUTC: new Date().toISOString(), entries};
}

const result = mode === 'inventory' ? await inventory() : mode === 'manifest' ? await manifest() : null;
if (!result) throw new TypeError('Expected inventory or manifest mode.');
process.stdout.write(JSON.stringify(result) + '\n');
