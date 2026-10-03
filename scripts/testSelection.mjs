// One place that decides which test files run.
// allSpecFiles: every test/*.spec.js then every test/*.spec.mjs, each sorted (CI's globs).
// quotePricebookSpecFiles: every non-voice spec that imports quote-engine or
// price-book code, so new regression files are included without editing a list.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const QUOTE_PRICEBOOK_MODULES = /quote-engine-vnext|quoteDoneBridge|priceBookService|priceBookMoney|priceBookMetadata|priceBookAI|scopeConfiguration|installedPriceConfiguration|customerSummary|quoteIntake|quoteScopeDisclosure|pricebook[A-Z.]|quoteDoneControls|offeringEditor|scopeEditor|configuredOfferingsFixtures|quoteEngineVNextFixtures/;

export function allSpecFiles(root) {
  const names = readdirSync(path.join(root, 'test'));
  return [...names.filter(n => n.endsWith('.spec.js')).sort(), ...names.filter(n => n.endsWith('.spec.mjs')).sort()].map(n => 'test/' + n);
}

export function quotePricebookSpecFiles(root) {
  return allSpecFiles(root).filter(file => !/^test\/(voice|googleGenAi)/.test(file) && QUOTE_PRICEBOOK_MODULES.test(readFileSync(path.join(root, file), 'utf8'))).sort();
}
