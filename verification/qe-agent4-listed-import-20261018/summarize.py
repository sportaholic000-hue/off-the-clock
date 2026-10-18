from pathlib import Path
import hashlib,json,re,subprocess
root=Path(__file__).resolve().parents[2]
out=Path(__file__).resolve().parent
results={};failures={}
for name in ['baseline-retained.tap','baseline-new.tap','after-focused.tap','neighbors.tap','strict.tap','full.tap']:
 p=out/name
 if not p.exists(): continue
 s=p.read_text();results[name]={'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
 for key in ['tests','suites','pass','fail','cancelled','skipped','todo','duration_ms']:
  found=re.findall(r'^# '+key+r' (\d+(?:\.\d+)?)$',s,re.M)
  if found:results[name][key]=float(found[-1]) if '.' in found[-1] else int(found[-1])
 results[name]['summaryPresent']='tests' in results[name] and 'duration_ms' in results[name]
 results[name]['topLevelResults']=len(re.findall(r'^(?:ok|not ok) \d+ - ',s,re.M))
 rows=s.splitlines();entries=[]
 for i,line in enumerate(rows):
  match=re.match(r'^(\s*)not ok \d+ - (.*)$',line)
  if not match:continue
  end=i+1;closing=match[1]+'  ...'
  while end<len(rows) and rows[end]!=closing:end+=1
  block='\n'.join(rows[i:end+1])
  category='browser_launch' if 'browserType.launch' in block or "Executable doesn't exist" in block else 'parent_subtests' if 'subtestsFailed' in block else 'other'
  entries.append({'name':match[2],'category':category,'diagnostic':block})
 failures[name]=entries
 results[name]['failureCategories']={c:sum(e['category']==c for e in entries) for c in ['browser_launch','parent_subtests','other']}
(out/'local-results.json').write_text(json.dumps(results,indent=2)+'\n')
(out/'gate-failures.json').write_text(json.dumps({k:v for k,v in failures.items() if k in ['strict.tap','full.tap']},indent=2)+'\n')
base=json.loads((out/'base-retention.json').read_text())
changed=[];missing=[]
for p,expected in base['sha256'].items():
 target=root/p
 if not target.is_file():missing.append(p)
 elif hashlib.sha256(target.read_bytes()).hexdigest()!=expected:changed.append(p)
allowed=['server/src/voice/listedPriceCalculation.js','server/src/websitePriceExtraction.js']
retention={'base':base['base'],'parents':base['parents'],'existingFiles':len(base['sha256']),'byteIdentical':len(base['sha256'])-len(changed)-len(missing),'changedExistingFiles':changed,'missingExistingFiles':missing,'unexpectedChanges':[p for p in changed if p not in allowed]}
retention['existingTestFiles']=sum(p.startswith('test/') or p.startswith('server/quote-engine-vnext/tests/') for p in base['sha256'])
retention['existingVerificationFiles']=sum(p.startswith('verification/') for p in base['sha256'])
retention['retained305FileSHA256']=base['sha256']['test/voiceListedPriceConditions20261018.spec.mjs']
retention['retained305FileUnchanged']='test/voiceListedPriceConditions20261018.spec.mjs' not in changed+missing
for parent in [base['base'],*base['parents'],'c1817621f6eccb31822979bf994efc4902682d34']:
 subprocess.run(['git','merge-base','--is-ancestor',parent,'HEAD'],cwd=root,check=True)
retention['allRequiredAncestorsPreserved']=True
parser=(root/allowed[0]).read_text();original=subprocess.check_output(['git','show',base['base']+':'+allowed[0]],cwd=root).decode()
retention['arithmeticCurrencyTailUnchanged']=parser.split(' const amount=')[1]==original.split(' const amount=')[1]
retention['candidateSHA256']={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in allowed+['test/voiceAgent4ListedImport20261018.spec.mjs','test/voiceAgent4WebsiteQualifications20261018.spec.mjs']}
(out/'retention.json').write_text(json.dumps(retention,indent=2)+'\n')
assert not missing and not retention['unexpectedChanges'], retention
print(json.dumps({'results':results,'retention':retention},indent=2))
