import json
import os
import pathlib
import re
import subprocess
import sys
import time

root = pathlib.Path(__file__).resolve().parent
repo = root.parent.parent
runtime = repo.parent / 'qe-integration-runtime/node_modules/.bin'
node = str(runtime / 'node')
env = os.environ.copy()
env['PATH'] = str(runtime) + os.pathsep + env['PATH']
env['PLAYWRIGHT_BROWSERS_PATH'] = str(repo.parent / 'qe-integration-browsers')
temp = repo.parent / 'qe-roof-integration-tmp' / sys.argv[1]
temp.mkdir(parents=True, exist_ok=True)
env['TMPDIR'] = str(temp)

checks = {
    'pi00': ['test/qeAgent1InteriorActivation20261019.spec.mjs', 'test/qeAgent1InteriorDelivery20261019.spec.mjs', 'test/qeAgent1InteriorHistorical20261019.spec.mjs'],
    'activation-neighbors': ['test/configuredOfferings.spec.mjs', 'test/quoteActivationParity20261005.spec.mjs', 'test/quoteOfferingScopeIsolation.spec.mjs', 'test/surfacePricingLaneCFixes20261016.spec.mjs', 'test/surfacePricing20261016.spec.mjs', 'test/surfacePricing20261016.dom.spec.mjs'],
    'parser': ['test/voiceListedPriceConditions20261018.spec.mjs', 'test/voiceAgent4ListedImport20261018.spec.mjs', 'test/voiceAgent4WebsiteQualifications20261018.spec.mjs', 'test/websitePriceImport.spec.mjs', 'test/websitePriceConditionsAudit20261008.spec.mjs', 'test/websitePriceDraftRoutes.spec.mjs', 'test/claudeListedUnits20261008.spec.mjs', 'test/engineAuditListedPrices20261008.spec.mjs', 'test/fixedPricesKnowledge20261005.spec.mjs', 'test/voiceCore20261007.spec.mjs', 'test/voiceSurfacePricing20261016.spec.mjs', 'test/voiceRuntimeRoutes.spec.mjs', 'test/voicePromptCompiler.spec.mjs', 'test/voiceSecurity.spec.mjs', 'test/voiceAgent4ParenthesizedConditions20261018.spec.mjs', 'test/voiceAgent4ImportPunctuation20261019.spec.mjs'],
    'geometry': ['test/qeAgent1GeometryBoundaries20261019.spec.mjs', 'test/qeAgent1GeometryDelivery20261019.spec.mjs', 'test/qeAgent1GeometryHistorical20261019.spec.mjs'],
    'f16-direct': ['test/qeAgent1ApprovalPrecision20261018.spec.mjs', 'verification/qe-agent1-core-accuracy-20261018/f16-with-agent2.spec.mjs', 'test/qeAgent2PricePrecision.spec.mjs', 'test/qeAgent2PriceMetadata.spec.mjs'],
    'f16-entry': ['test/qeAgent2IntegrationF16PricePrecision20261019.spec.mjs'],
    'f18': ['test/voiceAgent4F18Integration20261018.spec.mjs', 'test/voiceAgent4F18Repair20261018.spec.mjs'],
    'f18-matrix': ['verification/qe-agent2-roof-pitch-integration-20261019/f18-original-matrix.spec.mjs'],
    'rendered': ['test/qeAgent3ScopePresentation20261018.spec.mjs', 'test/qeAgent2PriceEditor.browser.spec.mjs'],
    'compatibility': [
        'test/backupRestoreRehearsal.spec.mjs', 'test/everytrade20261017.spec.mjs',
        'test/qeAccuracyIntegration20261018.spec.mjs', 'test/qeAgent1CoreAccuracy20261018.spec.mjs',
        'test/qeAgent1Historical20261018.spec.mjs', 'test/qeRoofExactSubtraction20261018.spec.mjs',
        'test/qeRoofUnderlaymentAccuracy20261018.spec.mjs', 'test/qeRoofZeroAdjustments20261018.spec.mjs',
        'test/quoteConcreteLandscape20261016.spec.mjs', 'test/quoteEngineVNext.spec.js',
        'test/quoteEngineVNextAdversarial.spec.js', 'test/quoteReviewFixes.spec.mjs',
        'test/quoteStartingValues20261017.browser.spec.mjs', 'test/quoteStartingValues20261017.spec.mjs',
        'test/releaseProductionEngineGuard.spec.mjs'
    ]
}
checks['a1'] = ['test/qeAgent1RoofPitchActivationChannels20261019.spec.mjs', 'test/qeAgent1RoofPitchActivationHistorical20261019.spec.mjs', 'test/qeAgent1RoofPitchActivationReadiness20261019.spec.mjs']
checks['a1-parser'] = checks['a1'] + checks['parser']
checks['qualification'] = ['verification/qe-agent1-roof-pitch-activation-20261019/harness-integration-20261019/qualification.spec.mjs']
check = sys.argv[1]
command = ['npm', 'run', 'build'] if check == 'build' else [
    node, '--experimental-test-module-mocks', '--import', './test/pricebookTestEnv.mjs',
    '--test-concurrency=1', '--test', '--test-reporter=tap', *checks[check]
]
log = root / (check + ('.log' if check == 'build' else '.tap'))
if log.exists() or pathlib.Path(str(log) + '.gz').exists(): raise SystemExit('Refusing to overwrite earlier evidence: ' + str(log))
started = time.time()
with log.open('wb') as output:
    result = subprocess.run(command, cwd=repo, env=env, stdout=output, stderr=subprocess.STDOUT)
text = log.read_text(errors='replace')
summary = {k: int(v) for k, v in re.findall(r'^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$', text, re.M)}
expected = {'a1': 113, 'a1-parser': 987, 'qualification': 5, 'activation-neighbors': 177, 'pi00': 45, 'parser': 874, 'compatibility': 491, 'geometry': 525, 'f16-direct': 94, 'f16-entry': 14, 'f18': 41, 'f18-matrix': 91, 'rendered': 5}
verified = result.returncode == 0
if check != 'build':
    verified = verified and bool(summary) and summary.get('tests') == summary.get('pass')
    verified = verified and all(summary.get(k) == 0 for k in ['fail', 'cancelled', 'skipped', 'todo'])
    if check in expected:
        verified = verified and summary.get('tests') == expected[check]
receipt = {
    'check': check, 'command': command, 'node': subprocess.check_output([node, '--version'], text=True).strip(),
    'exit_code': result.returncode, 'seconds': round(time.time() - started, 3), 'summary': summary,
    'log': str(log.relative_to(repo)), 'verification_passed': bool(verified)
}
(root / (check + '-execution.json')).write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
if not verified:
    failures = [line for line in text.splitlines() if re.match(r'^not ok |^\s*error:|^\s*expected:|^\s*actual:', line)]
    print(json.dumps({'failure_excerpt': failures[:60], 'tail': text.splitlines()[-15:]}))
sys.exit(0 if verified else 1)
