import gzip,hashlib,json,subprocess
from pathlib import Path

root=Path.cwd();e=root/'verification/qe-agent4-import-integration-20261019'
with gzip.open(e/'parent-preservation-manifest.json.gz','rt') as f:manifest=json.load(f)
expected=manifest['expectedInheritedTree'];mismatches=[]
for p,row in expected.items():
    path=root/p
    if not path.is_file():mismatches.append({'path':p,'problem':'missing'});continue
    blob=subprocess.check_output(['git','hash-object',str(path)],text=True).strip()
    if blob!=row['blob']:mismatches.append({'path':p,'expected':row['blob'],'actual':blob})
assert not mismatches,mismatches
a,b=manifest['orderedParents'];A,B=manifest['parents'][a],manifest['parents'][b]
incoming_tests=[p for p in subprocess.check_output(['git','diff','--name-only',manifest['mergeBase'],b],text=True).splitlines() if p.startswith('test/')]
assert len(incoming_tests)==4
assert all(expected.get(p)==B[p] for p in incoming_tests)
assert subprocess.check_output(['git','ls-files','-u'],text=True)==''
if (root/'.git/MERGE_HEAD').exists():
    assert (root/'.git/MERGE_HEAD').read_text().strip()==b
    assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==a
else:
    assert subprocess.check_output(['git','show','-s','--format=%P','HEAD'],text=True).strip().split()==[a,b]
index={}
for line in subprocess.check_output(['git','ls-files','-s'],text=True).splitlines():
    header,path=line.split('\t',1);mode,blob,stage=header.split();assert stage=='0';index[path]={'mode':mode,'blob':blob}
for path,row in expected.items():
    assert index[path]=={'mode':row['mode'],'blob':row['blob']},path
engine='quote-engine-vnext-geometry-20261019-v12'
assert engine in (root/'server/quote-engine-vnext/engine.js').read_text()
assert engine in (root/'server/src/runtimeConfig.js').read_text()
assert 'timeout-minutes: 45' in (root/'.github/workflows/ci.yml').read_text()
result={'orderedParents':[a,b],'mergeBase':manifest['mergeBase'],'conflicts':[],'inheritedPaths':len(expected),'matchedPaths':len(expected),'changedExistingCombinedPaths':[p for p in A if expected.get(p)!=A[p]],'incomingTestFilesPreserved':incoming_tests,'combinedTestsPreserved':all(expected.get(p)==row for p,row in A.items() if p.startswith('test/') or p.startswith('server/quote-engine-vnext/tests/')),'combinedHistoricalEvidencePreserved':all(expected.get(p)==row for p,row in A.items() if p.startswith('verification/')),'importerHistoricalEvidencePreserved':all(expected.get(p)==row for p,row in B.items() if p.startswith('verification/')),'engineVersion':engine,'workflowBlob':expected['.github/workflows/ci.yml']['blob'],'selectorBlobs':{p:expected[p]['blob'] for p in ['scripts/testSelection.mjs','scripts/test-full.mjs','server/scripts/quote-vnext-gate.js']}}
assert result['combinedTestsPreserved'] and result['combinedHistoricalEvidencePreserved'] and result['importerHistoricalEvidencePreserved']
(e/'preservation.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
