import hashlib,json,re,subprocess
from pathlib import Path
from collections import Counter

root=Path.cwd();e=root/'verification/qe-agent4-condition-extensions-review-20261019'
base='db1dcb4cb4dedebb59811c390c8fe2ac9a608846'
manifest=json.loads((e/'base-file-sha256.json').read_text())
changed=[p for p,digest in manifest.items() if not (root/p).is_file() or hashlib.sha256((root/p).read_bytes()).hexdigest()!=digest]
assert changed==['server/src/websitePriceExtraction.js'],changed
assert (root/'test/voiceAgent4ConditionExtensions20261019.spec.mjs').read_bytes()==(e/'baseline-new.spec.mjs.txt').read_bytes()
parents=subprocess.check_output(['git','show','-s','--format=%P','c58ca997e9cf63739d399939bcdade83e97874d2'],text=True).strip().split()
assert parents==['235eb5c978f847c2d47379ae3cf03b52c1f9104c','4f6152413a650085a7fe6002dfd077a542f9c0c2']
ancestors=parents+['c58ca997e9cf63739d399939bcdade83e97874d2','9af52ddc13c78beec84e7f090506da8c9b5fd691','4a90f73695611bb42bb9fb50d40a16f9e01c3740','620431bbf3036ed8141665e26ab68c684415f2e1','d71f8e506293714e2630ceb07ae4f947c1e1bb97',base]
for sha in ancestors:subprocess.run(['git','merge-base','--is-ancestor',sha,'HEAD'],check=True)
def passing(path):return Counter(re.findall(r'^\s*ok \d+ - (.*)$',path.read_text(),re.M))
old=root/'verification/qe-agent4-import-condition-boundaries-20261019/coordinator-nine-variants/combined-1135.tap'
assert passing(old)==passing(e/'retained-1135.tap')
assert passing(e/'combined-1208.tap')==passing(old)+passing(e/'after-new.tap')
records=[]
for label in ['baseline-new','after-new']:
    rows=[]
    for line in (e/(label+'.tap')).read_text().splitlines():
        if not line.startswith('# {'):continue
        d=json.loads(line[2:].replace(chr(92)*2,chr(92)))
        if d.get('name','').startswith('Agent4 Extensions exact '):rows.append(d)
    assert len(rows)==5
    for d in rows:
        assert d['seen']==['/','/prices']
        for result in d['results']:
            for surface in ['direct','dispatched']:
                value=result[surface]
                if label=='baseline-new':assert value['status']=='calculated' and value['extendedAmount']=='30.00'
                else:assert value['status']=='needs_review' and 'extendedAmount' not in value
    (e/(label+'-exact-five.json')).write_text(json.dumps(rows,indent=2)+'\n')
result={'base':base,'baseFiles':len(manifest),'unchangedBaseFiles':len(manifest)-len(changed),'changedExistingFiles':changed,'unchangedExistingTestFiles':sum(p.startswith('test/') for p in manifest),'unchangedHistoricalEvidenceFiles':sum(p.startswith('verification/') for p in manifest),'workflowSHA256':manifest['.github/workflows/ci.yml'],'originalMergeParents':parents,'verifiedAncestors':ancestors,'retainedPassingNames':sum(passing(old).values()),'combinedPassingNames':sum(passing(e/'combined-1208.tap').values()),'newTestsUnchangedSinceBaseline':True}
(e/'preservation.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
