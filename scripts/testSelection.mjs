// One place that decides which test files run.
// allSpecFiles: every test/*.spec.js then every test/*.spec.mjs, each sorted (CI's globs).
// quotePricebookSpecFiles: every non-voice spec that reaches quote-engine, price-book
// or quote-presentation source through its imports, followed transitively through
// helper and fixture modules, so new regression files are included automatically.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const QUOTE_PRICEBOOK_SOURCES = /^(server\/quote-engine-vnext\/[^/]+\.js|server\/src\/(quoteDoneBridge|quoteDoneRoutes|quoteIntake|quoteRequestScope|quoteScopeDisclosure|customerSummary|customerExplanation|priceBookAI)\.js|server\/(priceBook\w*|installedPriceConfiguration|scopeConfiguration|pricePrecision|interviewConfiguration|taxJurisdiction|quoteEngine|quoteTemplates)\.js|client\/src\/(pricebook\w*|quoteDoneControls|offeringEditor|scopeEditor|installedMaterialsEditor|interviewConfiguration|interviewStructured|interviewAssist|quotePresentation|customerExplanation)\.(js|jsx))$/;

export function allSpecFiles(root) {
  const names = readdirSync(path.join(root, 'test'));
  return [...names.filter(n => n.endsWith('.spec.js')).sort(), ...names.filter(n => n.endsWith('.spec.mjs')).sort()].map(n => 'test/' + n);
}

const REPO_PATH = /['"](?:\.\/)?((?:server|client|test)\/[\w./-]+\.(?:m?js|jsx))['"]/g;
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.{1,2}\/[^'"]+)['"]/g;
export function reachedSources(root, file) {
  const seen = new Set(), queue = [file];
  while (queue.length) {
    const current = queue.pop();
    if (seen.has(current)) continue;
    seen.add(current);
    const absolute = path.join(root, current);
    if (!existsSync(absolute) || !/\.(m?js|jsx)$/.test(current)) continue;
    const text = readFileSync(absolute, 'utf8');
    for (const [, specifier] of text.matchAll(SPECIFIER)) {
      const target = path.relative(root, path.resolve(path.dirname(absolute), specifier)).split(path.sep).join('/');
      if (!target.startsWith('..') && !target.includes('node_modules')) queue.push(target);
    }
    // Helpers that build module paths at run time (path.join(root, 'server/...')).
    for (const [, repoPath] of text.matchAll(REPO_PATH)) queue.push(repoPath);
  }
  return seen;
}

export function quotePricebookSpecFiles(root) {
  return allSpecFiles(root).filter(file => !/^test\/(voice|googleGenAi)/.test(file) && [...reachedSources(root, file)].some(source => QUOTE_PRICEBOOK_SOURCES.test(source))).sort();
}
