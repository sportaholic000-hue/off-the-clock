"""Decode and bind the unchanged A1/A3 browser evidence to the final merge."""
import base64,gzip,hashlib,json,re,sys
from collections import Counter
from pathlib import Path
out=Path(sys.argv[1]);sha=sys.argv[2];e=Path(__file__).resolve().parent.parent/'qe-agent3-recovery-integration-20261019'
expected=json.loads((e/'required-passing-names.json').read_text())
raw=(out/'hosted-test.log').read_text()
log=re.sub(r'^\d{4}-\d\d-\d\dT\S+Z ','',raw.replace('\ufeff',''),flags=re.M)
parts={'strict':log.split('##[group]Run npm run test:quote\n',1)[1].split('##[group]Run npm test\n',1)[0],
 'full':log.split('##[group]Run npm test\n',1)[1].split('##[group]Run node .github/scripts/check-test-results.mjs',1)[0]}
summary={}
for gate,body in parts.items():
 directory=out/gate;directory.mkdir(exist_ok=True)
 recovery=re.findall(r'A3_RECOVERY_EVIDENCE_GZIP_BASE64 ([A-Za-z0-9+/=]+)',body);assert len(recovery)==1
 compressed=base64.b64decode(recovery[0],validate=True);record=json.loads(gzip.decompress(compressed))
 assert len(record['cases'])==11 and all(c['passed'] and not c['pageErrors'] for c in record['cases'])
 assert Counter(c['name'] for c in record['cases'])==Counter(expected['recovery']['leafNames'])
 for path,digest in record['sources'].items():
  assert path in ['client/src/quotedone.jsx','client/src/quoteSubmission.js','test/qeAgent3WidgetRecovery20261019.browser.spec.mjs']
  assert hashlib.sha256(Path(path).read_bytes()).hexdigest()==digest
 (directory/'recovery.json.gz').write_bytes(compressed)
 bundles=[];pending=[];total_expected=0
 for match in re.finditer(r'A1_REVIEW_EVIDENCE (\d+)/(\d+) ([A-Za-z0-9+/=]+)',body):
  number,total=map(int,match.group(1,2))
  if number==1:assert not pending;total_expected=total
  assert total==total_expected and number==len(pending)+1
  pending.append(match.group(3))
  if number==total:bundles.append(base64.b64decode(''.join(pending),validate=True));pending=[]
 assert len(bundles)==2 and not pending
 a1=[]
 for index,compressed in enumerate(bundles):
  files=json.loads(gzip.decompress(compressed))
  def data(name):
   item=files[name];assert item['encoding']=='utf8';return json.loads(item['content'])
  binding=data('source-binding.json');assert binding['head']==sha and binding['liveProviders'] is False
  rows=data('results.json');result=data('result.json')
  assert result['failed']==0 and all(r['status']=='passed' for r in rows)
  title='qe-agent1 independent fence and flat-roof dependency reproductions' if len(rows)==4 else 'qe-agent1 remaining twelve services use Chromium and real public HTTP'
  assert Counter(r['type']+' '+r['stage'] for r in rows)==Counter(expected['a1']['groups'][title])
  (directory/f'a1-{index+1}.json.gz').write_bytes(compressed)
  a1.append({'group':title,'cases':len(rows),'browser':binding['browser'],'head':binding['head'],'allPassed':True})
 assert sorted(x['cases'] for x in a1)==[4,88]
 summary[gate]={'recovery':{'cases':11,'allPassed':True,'chromium':record['chromium'],'sourceHashesMatch':True,'finalReceiptCounts':record['cases'][-1]['after']},'a1':a1}
(out/'browser-evidence-verification.json').write_text(json.dumps({'sha':sha,'gates':summary},indent=2)+'\n')
print(json.dumps(summary,indent=2))
