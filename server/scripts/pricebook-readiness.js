// Read-only readiness report for saved price books under this engine version.
// For every saved book and service it prints whether the service quotes now,
// and otherwise the owner fields, decisions or re-approval it needs first.
// Output names owner IDs, service types and field names only: never prices or
// customer data. Run it against the production data directory before a
// deploy to see which businesses must act, and again after.
//
//   node server/scripts/pricebook-readiness.js [price-book directory]
//
// The directory defaults to PRICEBOOK_PATH (or data/pricebooks). Nothing is
// written: books are read from disk and checked with the same status the
// application uses.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pricebookDirectory } from '../priceBookService.js';
import { applicationStatus } from '../src/quoteDoneBridge.js';
import { ENGINE_VERSION } from '../quote-engine-vnext/engine.js';

export function pricebookReadiness(directory = pricebookDirectory()) {
  const rows = [];
  for (const name of readdirSync(directory).filter(entry => /^[^.]+\.json$/.test(entry)).sort()) {
    const ownerId = name.slice(0, -'.json'.length);
    let book;
    try { book = JSON.parse(readFileSync(join(directory, name), 'utf8')); }
    catch { rows.push({ ownerId, status: 'UNREADABLE' }); continue; }
    if (!book || typeof book !== 'object' || !Array.isArray(book.services)) { rows.push({ ownerId, status: 'UNREADABLE' }); continue; }
    for (const service of book.services) {
      let status;
      try { status = applicationStatus(service, { ...book, ownerId }); }
      catch (error) { rows.push({ ownerId, serviceId: service?.id ?? null, serviceType: service?.serviceType ?? null, status: 'UNREADABLE', issues: [error.message] }); continue; }
      rows.push({
        ownerId,
        serviceId: service?.id ?? null,
        serviceType: service?.serviceType ?? null,
        active: service?.active === true,
        status: status.status,
        missingOwnerFields: status.missingOwnerFields || [],
        approvedEngineVersion: service?.quoteDoneApproval?.engineVersion ?? null,
        issues: [...new Set([...(status.applicationIssues || []), ...(status.validationErrors || [])])]
      });
    }
  }
  return {
    engineVersion: ENGINE_VERSION,
    books: new Set(rows.map(row => row.ownerId)).size,
    services: rows.filter(row => row.serviceType !== undefined).length,
    quotingLive: rows.filter(row => row.status === 'QUOTING LIVE').length,
    rows
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  console.log(JSON.stringify(pricebookReadiness(process.argv[2] || pricebookDirectory()), null, 2));
}
