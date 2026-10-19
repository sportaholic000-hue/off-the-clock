import gzip,json,subprocess
from pathlib import Path
root=Path.cwd();e=Path(__file__).resolve().parent
m=json.loads(gzip.decompress((e/'preservation-manifest.json.gz').read_bytes()))
index={}
for row in subprocess.check_output(['git','ls-files','--stage'],text=True).splitlines():
    meta,path=row.split('\t',1);mode,blob,stage=meta.split();assert stage=='0',path
    index[path]={'mode':mode,'type':'blob','blob':blob}
for path,expected in m['expectedInherited'].items():assert index.get(path)==expected,path
extra=set(index)-set(m['expectedInherited'])
assert all(p.startswith('verification/qe-agent4-a1-integration-20261019/') for p in extra),extra
assert not subprocess.check_output(['git','diff','--name-only'],text=True).strip()
for path in ['server/quote-engine-vnext/engine.js','server/src/runtimeConfig.js']:
    assert 'quote-engine-vnext-geometry-20261019-v12' in (root/path).read_text()
assert '    timeout-minutes: 45\n' in (root/'.github/workflows/ci.yml').read_text()
result={'parents':m['parents'],'commonAncestor':m['commonAncestor'],'overlap':[],
        'inheritedFilesVerified':len(m['expectedInherited']),'incomingAdded':len(m['incomingAdded']),
        'allInheritedBlobsAndModesMatch':True,'productionChanged':False,'existingAssertionsChanged':False,
        'workflowAndSelectorsUnchanged':True,'engineVersion':'v12','testTimeoutMinutes':45}
(e/'preservation.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
