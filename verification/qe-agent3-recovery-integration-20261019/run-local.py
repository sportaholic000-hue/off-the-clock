import datetime,json,os,re,subprocess
from collections import Counter
from pathlib import Path
e=Path(__file__).resolve().parent;root=Path.cwd()
node=str(root.parent/'a3-tools/node_modules/node-linux-x64/bin/node')
env=dict(os.environ,TMPDIR=str(root.parent/'tmp'));env['PATH']=str(Path(node).parent)+os.pathsep+env['PATH']
prior=json.loads(Path('verification/qe-agent4-a1-integration-20261019/local-results.json').read_text())
importer=next(r['command'] for r in prior if r['name']=='importer-1208');importer=[node,*importer[1:]]
focused=[node,'--test','test/quoteApplicationBoundary.spec.mjs','test/quoteOriginStorage.spec.mjs','test/quoteApprovalHistory20261005.spec.mjs','test/quoteReleaseStorage.spec.mjs','test/qeAgent3WidgetDependencies20261019.spec.mjs']
probe=[node,'--input-type=module','-e',f"import {{chromium}} from {json.dumps(str(root.parent/'a3-tools/node_modules/playwright/index.mjs'))};const b=await chromium.launch({{headless:true,executablePath:{json.dumps(str(root.parent/'tmp/a3-chromium'))},args:['--no-sandbox','--disable-dev-shm-usage']}});await b.close();"]
records=[]
for name,cmd,n in [('importer-1208',importer,1208),('focused-59',focused,59),('chromium-probe',probe,None)]:
 out=e/(name+('.tap' if n else '.log'));started=datetime.datetime.now(datetime.timezone.utc).isoformat()
 with out.open('w') as f:run=subprocess.run(cmd,env=env,stdout=f,stderr=subprocess.STDOUT)
 record={'name':name,'command':cmd,'startedAt':started,'exitCode':run.returncode,'TMPDIR':env['TMPDIR']}
 if n:
  text=out.read_text();record['summary']={k:int(v) for k,v in re.findall(r'^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$',text,re.M)}
  assert run.returncode==0 and record['summary']=={'tests':n,'pass':n,'fail':0,'cancelled':0,'skipped':0,'todo':0},record
  if name=='importer-1208':
   names=re.findall(r'^\s*ok \d+ - (.*)$',text,re.M);expected=json.loads((e/'required-passing-names.json').read_text())['importer']['names']
   assert Counter(names)==Counter(expected);record['individualNamesMatched']=len(names)
 records.append(record);(e/'local-results.json').write_text(json.dumps(records,indent=2)+'\n');print(json.dumps(record),flush=True)
