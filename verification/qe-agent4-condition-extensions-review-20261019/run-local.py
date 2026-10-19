import datetime,hashlib,json,os,re,subprocess,sys
from pathlib import Path

root=Path.cwd(); e=root/'verification/qe-agent4-condition-extensions-review-20261019'
previous=json.loads((root/'verification/qe-agent4-import-condition-boundaries-20261019/coordinator-nine-variants/local-commands.json').read_text())
retained=next(x['command'] for x in previous if x['name']=='combined-1135')
new='test/voiceAgent4ConditionExtensions20261019.spec.mjs'
env=dict(os.environ,TMPDIR=str(root.parent/'agent4-r1-r2-tmp'));env['PATH']=str(Path(retained[0]).parent)+os.pathsep+env['PATH']
focused=retained[:retained.index('--test-reporter=tap')+1]+[new]
original=[retained[0],'--test-reporter=tap',str(e/'coordinator-original/reproduce.mjs'),str(root)]
phase=sys.argv[1]
if phase=='baseline':
    assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()=='db1dcb4cb4dedebb59811c390c8fe2ac9a608846'
    (e/'baseline-new.spec.mjs.txt').write_bytes((root/new).read_bytes())
    (e/'baseline-extraction.js.txt').write_bytes((root/'server/src/websitePriceExtraction.js').read_bytes())
    runs=[('baseline-original',original,1),('baseline-new',focused,1)]
else:
    assert (root/new).read_bytes()==(e/'baseline-new.spec.mjs.txt').read_bytes()
    runs=[('after-original',original,0),('after-new',focused,0),('retained-1135',retained,0),('combined-1208',retained+[new],0),('build',['npm','run','build'],0)]
records=[]
for name,command,expected in runs:
    path=e/(name+('.log' if name=='build' else '.tap'))
    record={'name':name,'command':command,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'environment':{'TMPDIR':env['TMPDIR'],'node':retained[0]},'sourceHashes':{p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in ['server/src/websitePriceExtraction.js','server/src/websitePriceImport.js','.github/workflows/ci.yml',new]}}
    with path.open('w') as out:result=subprocess.run(command,env=env,stdout=out,stderr=subprocess.STDOUT)
    record['exitCode']=result.returncode
    record['summary']=dict(re.findall(r'^# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) (\S+)$',path.read_text(),re.M))
    records.append(record);(e/(phase+'-commands.json')).write_text(json.dumps(records,indent=2)+'\n')
    print(json.dumps({'name':name,'exitCode':result.returncode,'summary':record['summary']}),flush=True)
    assert result.returncode==expected,(name,result.returncode,expected)
