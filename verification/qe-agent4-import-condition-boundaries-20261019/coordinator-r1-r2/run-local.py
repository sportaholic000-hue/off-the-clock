import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

root=Path.cwd()
e=root/'verification/qe-agent4-import-condition-boundaries-20261019/coordinator-r1-r2'
node='/workspace/scratch/5ed2408ba85b/agent4-f18-runtime/node_modules/node/bin/node'
old=json.loads((e.parent/'final-local-commands.json').read_text())
retained=next(x['command'] for x in old if x['name']=='expanded-948')
retained[0]=node
new='test/voiceAgent4ImportConditionR1R2Followup20261019.spec.mjs'
assert (root/new).read_bytes()==(e/'baseline-new.spec.mjs.txt').read_bytes()
env=dict(os.environ,TMPDIR=str(root.parent/'agent4-r1-r2-tmp'))
env['PATH']=str(Path(node).parent)+os.pathsep+env['PATH']
runs=[('retained-948',retained,0),('expanded-1030',retained+[new],0),('handoffs',[node,'--experimental-test-module-mocks','--import','./test/pricebookTestEnv.mjs','--test','--test-concurrency=1','--test-reporter=tap','verification/qe-agent4-import-condition-boundaries-20261019/handoff-probes.mjs'],1),('build',['npm','run','build'],0)]
records=[]
for name,command,expected in runs:
    path=e/(name+('.log' if name=='build' else '.tap'))
    record={'name':name,'command':command,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'environment':{'TMPDIR':env['TMPDIR'],'node':node},'sourceHashes':{p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in ['server/src/websitePriceExtraction.js','server/src/websitePriceImport.js','.github/workflows/ci.yml',new]}}
    with path.open('w') as out:result=subprocess.run(command,env=env,stdout=out,stderr=subprocess.STDOUT)
    record['exitCode']=result.returncode
    record['summary']=dict(re.findall(r'^# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) (\S+)$',path.read_text(),re.M))
    records.append(record);(e/'local-commands.json').write_text(json.dumps(records,indent=2)+'\n')
    print(json.dumps({'name':name,'exitCode':result.returncode,'summary':record['summary']}),flush=True)
    assert result.returncode==expected,(name,result.returncode,expected)
