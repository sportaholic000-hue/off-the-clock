// Loaded before test/application imports, including in node:test workers.
// Every worker owns its directory; child application processes inherit it.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = mkdtempSync(join(tmpdir(), 'otc-pricebook-test-'));
process.env.PRICEBOOK_PATH = directory;
process.once('exit', () => rmSync(directory, { recursive: true, force: true }));
