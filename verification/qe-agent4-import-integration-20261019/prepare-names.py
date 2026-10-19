import hashlib,json,re,sys
from pathlib import Path
from collections import Counter

root=Path.cwd();e=root/'verification/qe-agent4-import-integration-20261019'
parent_log=Path(sys.argv[1]);raw=parent_log.read_text()
# GitHub may prefix a log chunk with a UTF-8 BOM before its timestamp.
normalized=raw.replace('\ufeff','')
log=re.sub(r'^\d{4}-\d\d-\d\dT\S+Z ','',normalized,flags=re.M)
def section(start,end):
    assert log.count(start)==1,(start,log.count(start))
    return log.split(start,1)[1].split(end,1)[0]
parts={
 'strict':section('##[group]Run npm run test:quote\n','##[group]Run npm test\n'),
 'full':section('##[group]Run npm test\n','##[group]Run node .github/scripts/check-test-results.mjs'),
 'browser':section('##[group]Run node --test test/ownerAlertRepair20261006.browser.spec.mjs','##[group]Run npm run test:quote\n')
}
def names(body):
    rows=re.findall(r'^\s*ok \d+ - (.*)$',body,re.M)
    canonical='website rejects URL before DNS https://user:password@business.example';masked='website rejects URL before DNS ***business.example'
    if canonical not in rows and rows.count(masked)==1:
        i=rows.index(masked)
        assert rows[i-1]=='website rejects URL before DNS ftp://business.example'
        assert rows[i+1]=='website rejects URL before DNS https://business.example:8080'
        rows[i]=canonical
    return rows
parent={}
for gate,expected in [('strict',6070),('full',7701),('browser',12)]:
    body=parts[gate];summary={k:int(re.findall(r'^# '+k+r' (\d+)\s*$',body,re.M)[-1]) for k in ['tests','pass','fail','cancelled','skipped','todo']}
    assert summary=={'tests':expected,'pass':expected,'fail':0,'cancelled':0,'skipped':0,'todo':0},summary
    rows=names(body);assert len(rows)==expected
    parent[gate]={'count':expected,'names':rows}
imported=root/'verification/qe-agent4-condition-extensions-review-20261019/combined-1208.tap'
importer=names(imported.read_text());assert len(importer)==1208
additional=Counter(importer)-Counter(parent['full']['names']);assert sum(additional.values())==334
assert not set(additional).intersection(parent['strict']['names'])
selection=json.loads((e/'selection.json').read_text())
expected={'parentSHA':'04df35cd8e9ced136ef611cfc2b25f2de64c21bf','parentRun':39302616280,'parentLogSHA256':hashlib.sha256(parent_log.read_bytes()).hexdigest(),'parent':parent,'importer':{'count':1208,'names':importer,'sha256':hashlib.sha256(imported.read_bytes()).hexdigest()},'additionalFullOnly':{'count':334,'names':list(additional.elements())},'expected':{'strict':6070,'full':8035,'browser':12,'strictFiles':len(selection['after']['strict']),'fullFiles':len(selection['after']['full'])}}
(e/'required-passing-names.json').write_text(json.dumps(expected,indent=2)+'\n')
print(json.dumps({'parent':{k:v['count'] for k,v in parent.items()},'importer':1208,'additionalFullOnly':334,'expected':expected['expected']}))
