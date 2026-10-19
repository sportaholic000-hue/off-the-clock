import datetime,hashlib,json,os,re,subprocess
from pathlib import Path

root=Path.cwd();e=root/'verification/qe-agent4-import-condition-boundaries-20261019/coordinator-nine-variants'
prior=json.loads((e.parent/'coordinator-r1-r2/local-commands.json').read_text())
retained=next(x['command'] for x in prior if x['name']=='expanded-1030')
new='test/voiceAgent4ImportNineVariants20261019.spec.mjs'
assert (root/new).read_bytes()==(e/'baseline-new.spec.mjs.txt').read_bytes()
env=dict(os.environ,TMPDIR=str(root.parent/'agent4-r1-r2-tmp'));env['PATH']=str(Path(retained[0]).parent)+os.pathsep+env['PATH']
focused=retained[:retained.index('--test-reporter=tap')+1]+[new]
handoffs=next(x['command'] for x in prior if x['name']=='handoffs')
runs=[('after-new',focused,0),('retained-1030',retained,0),('combined-1135',retained+[new],0),('handoffs',handoffs,1),('build',['npm','run','build'],0)]
records=[]
for name,command,expected in runs:
    path=e/(name+('.log' if name=='build' else '.tap'))
    record={'name':name,'command':command,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'environment':{'TMPDIR':env['TMPDIR'],'node':retained[0]},'sourceHashes':{p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in ['server/src/websitePriceExtraction.js','server/src/websitePriceImport.js','.github/workflows/ci.yml',new]}}
    with path.open('w') as out:result=subprocess.run(command,env=env,stdout=out,stderr=subprocess.STDOUT)
    record['exitCode']=result.returncode
    record['summary']=dict(re.findall(r'^# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) (\S+)$',path.read_text(),re.M))
    records.append(record);(e/'local-commands.json').write_text(json.dumps(records,indent=2)+'\n')
    print(json.dumps({'name':name,'exitCode':result.returncode,'summary':record['summary']}),flush=True)
    assert result.returncode==expected,(name,result.returncode,expected)
