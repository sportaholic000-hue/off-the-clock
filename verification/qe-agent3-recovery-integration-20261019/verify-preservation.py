import gzip,json,subprocess,hashlib
from pathlib import Path
e=Path(__file__).resolve().parent;prefix=e.relative_to(Path.cwd()).as_posix()+'/'
m=json.loads(gzip.decompress((e/'preservation-manifest.json.gz').read_bytes()))
index={}
for row in subprocess.check_output(['git','ls-files','--stage'],text=True).splitlines():
 meta,p=row.split('\t',1);mode,blob,stage=meta.split();assert stage=='0',p
 index[p]={'mode':mode,'type':'blob','blob':blob}
for p,v in m['expectedInherited'].items():assert index.get(p)==v,p
assert all(p.startswith(prefix) for p in set(index)-set(m['expectedInherited']))
assert all(p.startswith(prefix) for p in subprocess.check_output(['git','diff','--name-only'],text=True).splitlines())
protected=['scripts/testSelection.mjs','server/quote-engine-vnext/engine.js','server/src/runtimeConfig.js','.github/workflows/ci.yml','client/src/widget-entry.jsx']
for p in protected:
 actual=Path(p).read_bytes()
 for parent in m['parents']:assert actual==subprocess.check_output(['git','show',parent+':'+p]),(p,parent)
assert '    timeout-minutes: 45\n' in Path('.github/workflows/ci.yml').read_text()
assert 'quote-engine-vnext-geometry-20261019-v12' in Path('server/quote-engine-vnext/engine.js').read_text()
result={'orderedParents':m['parents'],'commonAncestor':m['commonAncestor'],'inheritedFilesVerified':len(m['expectedInherited']),'overlap':[],
 'allInheritedBlobsAndModesMatch':True,'newIntegrationChangesOnly':True,'engineVersion':'v12','testTimeoutMinutes':45,
 'protectedSha256':{p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in protected}}
(e/'preservation.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
