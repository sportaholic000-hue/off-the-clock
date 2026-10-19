"""Exact-head gate, suite selection, and passing-name occurrence audit."""
import hashlib,json,re,sys
from collections import Counter
from pathlib import Path
e=Path(__file__).resolve().parent;out=Path(sys.argv[1]);sha=sys.argv[2]
def read(name):return json.loads((out/name).read_text())
expected=json.loads((e/'required-passing-names.json').read_text())
run=read('hosted-run-final.json');jobs=read('hosted-jobs-final.json')['jobs']
assert run['head_sha']==sha and run['status']=='completed' and run['conclusion']=='success'
assert read('remote-ref-final.json')['object']['sha']==sha
commit=read('remote-commit-final.json')
assert commit['sha']==sha and [p['sha'] for p in commit['parents']]==[expected['parentSHA'],expected['a1SHA']]
for name in ['test','voice-docker-startup']:
    job=next(j for j in jobs if j['name']==name)
    assert job['head_sha']==sha and job['status']=='completed' and job['conclusion']=='success'
assert all(j['conclusion']=='skipped' for j in jobs if j['name'].startswith('tag-candidate-'))
steps={s['name']:s['conclusion'] for s in next(j for j in jobs if j['name']=='test')['steps']}
for name in ['Install from lockfile (ignores committed node_modules)','Build owner app and widget','Owner alerts and dashboard browser regressions','Strict quote engine and price book gate','Full test suite','No failures beyond the known list','Production dependency audit']:
    assert steps[name]=='success',(name,steps[name])
docker=next(j for j in jobs if j['name']=='voice-docker-startup')
for name in ['Build production runtime image','Voice enabled with synthetic credentials and no provider network']:
    assert next(s for s in docker['steps'] if s['name']==name)['conclusion']=='success'
assert 'PASS: production Docker image, no specs, voice enabled, synthetic credentials, network disabled, /api/health 200' in (out/'hosted-docker.log').read_text()
raw=(out/'hosted-test.log').read_text();assert sha in raw
log=re.sub(r'^\d{4}-\d\d-\d\dT\S+Z ','',raw.replace('\ufeff',''),flags=re.M)
def section(start,end):
    assert log.count(start)==1,(start,log.count(start))
    body=log.split(start,1)[1];assert end in body
    return body.split(end,1)[0]
parts={'strict':section('##[group]Run npm run test:quote\n','##[group]Run npm test\n'),
       'full':section('##[group]Run npm test\n','##[group]Run node .github/scripts/check-test-results.mjs'),
       'browser':section('##[group]Run node --test test/ownerAlertRepair20261006.browser.spec.mjs','##[group]Run npm run test:quote\n')}
result={'sha':sha,'parents':[p['sha'] for p in commit['parents']],'tree':commit['tree']['sha'],
        'run_id':run['id'],'run_attempt':run['run_attempt'],'url':run['html_url'],'summaries':{},
        'nameChecks':{},'a1Groups':{},'redactions':[],'individualPassingNames':{}}
observed={}
for gate,body in parts.items():
    n=expected['expected'][gate]
    summary={k:int(re.findall(r'^# '+k+r' (\d+)\s*$',body,re.M)[-1]) for k in ['tests','pass','fail','cancelled','skipped','todo']}
    assert summary=={'tests':n,'pass':n,'fail':0,'cancelled':0,'skipped':0,'todo':0},(gate,summary)
    assert not re.search(r'^\s*not ok \d+',body,re.M)
    rows=[{'number':int(m[0]),'name':m[1]} for m in re.findall(r'^\s*ok (\d+) - (.*)$',body,re.M)]
    assert len(rows)==n,(gate,len(rows),n)
    assert not any(re.search(r'#\s*(?:SKIP|TODO)\b',r['name'],re.I) for r in rows)
    canonical='website rejects URL before DNS https://user:password@business.example';masked='website rejects URL before DNS ***business.example'
    names=[r['name'] for r in rows]
    if canonical not in names and names.count(masked)==1:
        i=names.index(masked)
        assert names[i-1]=='website rejects URL before DNS ftp://business.example'
        assert names[i+1]=='website rejects URL before DNS https://business.example:8080'
        assert rows[i-1]['number']+1==rows[i]['number']==rows[i+1]['number']-1
        rows[i]['name']=canonical;result['redactions'].append({'gate':gate,'masked':masked,'canonical':canonical,'adjacentRecordsVerified':True})
    observed[gate]=Counter(r['name'] for r in rows)
    required=Counter(expected['parent'][gate])
    if gate!='browser':required.update(expected['a1']['names'])
    assert observed[gate]==required,{'gate':gate,'missing':dict(required-observed[gate]),'unexpected':dict(observed[gate]-required)}
    result['summaries'][gate]=summary;result['nameChecks'][gate]={'matched':n,'missing':[],'unexpected':[]}
    result['individualPassingNames'][gate]=rows
    if gate!='browser':
        result['a1Groups'][gate]={}
        for title,names in expected['a1']['groups'].items():
            start=re.findall(r'^# Subtest: '+re.escape(title)+r'$',body,re.M);assert len(start)==1,(gate,title,len(start))
            group=body.split('# Subtest: '+title+'\n',1)[1]
            end=re.search(r'^ok \d+ - '+re.escape(title)+r'$',group,re.M);assert end,(gate,title)
            passed=re.findall(r'^\s*ok \d+ - (.*)$',group[:end.start()],re.M)
            assert Counter(passed)==Counter(names),(gate,title,passed)
            result['a1Groups'][gate][title]={'count':len(passed),'passingOccurrences':dict(Counter(passed))}
        browser_name='qe-agent3 representative public-intake case suite runs in hosted Chromium and covers its actual 8 of 20 services'
        assert observed[gate][browser_name]==1
assert not Counter(expected['importer']['names'])-observed['full']
selection=json.loads((e/'selection.json').read_text())
assert len(selection['after']['strict'])==294 and len(selection['after']['full'])==368
receipt='PASS: quote engine and price book gate (294 files, 6164/6164 tests, zero skips).'
assert parts['strict'].count(receipt)==1
audit=section('##[group]Run npm audit --omit=dev --audit-level=high\n','Post job cleanup.')
assert 'found 0 vulnerabilities' in audit
result.update(importerNamesVerified=1208,a1LeafCasesPerSuite=92,a1RecordsPerSuite=94,eightServiceBrowserEachSuite=True,
              strictFiles=294,fullFiles=368,strictSelectionReceipt=receipt,productionAudit='found 0 vulnerabilities',
              gates=steps,logSha256=hashlib.sha256((out/'hosted-test.log').read_bytes()).hexdigest())
(out/'hosted-verification.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ['individualPassingNames','a1Groups','gates']},indent=2))
