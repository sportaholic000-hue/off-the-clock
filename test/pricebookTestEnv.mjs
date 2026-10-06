// Loaded before test/application imports, including in node:test workers.
// Every worker owns its directory; child application processes inherit it.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = mkdtempSync(join(tmpdir(), 'otc-pricebook-test-'));
process.env.PRICEBOOK_PATH = directory;
// The missing-file guard keeps a durable creation ledger in the application
// database. A worker's disposable books must not share a persistent ledger
// with a later test run or another worker's recreated synthetic owners.
// Preserve an explicitly configured database, and replace only our own default.
let databaseDirectory;
if (!process.env.DATABASE_PATH || process.env.OTC_PRICEBOOK_TEST_DATABASE === process.env.DATABASE_PATH) {
  databaseDirectory = mkdtempSync(join(tmpdir(), 'otc-pricebook-database-test-'));
  process.env.DATABASE_PATH = join(databaseDirectory, 'synthetic.sqlite');
  process.env.OTC_PRICEBOOK_TEST_DATABASE = process.env.DATABASE_PATH;
}
process.once('exit', () => {
  rmSync(directory, { recursive: true, force: true });
  if (databaseDirectory) {
    try { rmSync(databaseDirectory, { recursive: true, force: true }); }
    catch (error) {
      // Windows can retain an open SQLite handle until the process exits.
      if (process.platform !== 'win32' || !['EPERM','EBUSY'].includes(error.code)) throw error;
    }
  }
});
