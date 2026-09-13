/** Run the ORIGINAL regression script and exact case bytes. No installation or source edits. */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(process.argv[2] || join(here, '../..'));
const source = join(here, 'independent');
let temporary;
try {
  if (!existsSync(join(root, 'server/quote-engine-vnext/index.js'))) throw new Error('Supply the off-the-clock repository root.');
  const manifest = JSON.parse(readFileSync(join(source, 'MANIFEST.json'), 'utf8'));
  const files = {
    'precision-regressions.mjs': readFileSync(join(source, 'precision-regressions.mjs')),
    'precision-cases.json': gunzipSync(readFileSync(join(source, 'precision-cases.json.gz')), { maxOutputLength: 1_000_000 })
  };
  for (const [name, bytes] of Object.entries(files)) {
    if (createHash('sha256').update(bytes).digest('hex') !== manifest.sha256[name]) throw new Error(`Original precision asset hash mismatch: ${name}`);
  }
  const cases = JSON.parse(files['precision-cases.json'].toString('utf8'));
  if (!Array.isArray(cases) || cases.length !== manifest.case_count || manifest.case_count !== 22) throw new Error('Original 22-case corpus mismatch.');
  temporary = mkdtempSync(join(tmpdir(), 'otc-original-precision-'));
  for (const [name, bytes] of Object.entries(files)) writeFileSync(join(temporary, name), bytes);
  console.log(`Verified original precision assets; testing source at ${root}`);
  const run = spawnSync(process.execPath, [join(temporary, 'precision-regressions.mjs'), root], { stdio: 'inherit' });
  if (run.error) throw run.error;
  process.exitCode = run.status === null ? 1 : run.status;
} catch (error) {
  console.error(`Precision verification failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (temporary) rmSync(temporary, { recursive: true, force: true });
}
