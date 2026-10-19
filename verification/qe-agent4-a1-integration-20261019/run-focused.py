import datetime,json,os,re,subprocess
from pathlib import Path
from collections import Counter
root=Path.cwd();e=Path(__file__).resolve().parent
prior=json.loads((root/'verification/qe-agent4-import-integration-20261019/local-commands.json').read_text())
command=next(x['command'] for x in prior if x['name']=='importer-1208')
env=dict(os.environ,TMPDIR=str(root.parent/'agent4-r1-r2-tmp'));env['PATH']=str(Path(command[0]).parent)+os.pathsep+env['PATH']
records=[]
for name,cmd in [('importer-1208',command),('chromium-probe',[command[0],'--input-type=module','-e',"import {chromium} from 'playwright';const b=await chromium.launch({headless:true,args:['--no-sandbox']});await b.close();"])]:
    out=e/(name+('.tap' if name.startswith('importer') else '.log'))
    started=datetime.datetime.now(datetime.timezone.utc).isoformat()
    with out.open('w') as f:run=subprocess.run(cmd,cwd=root,env=env,stdout=f,stderr=subprocess.STDOUT)
    record={'name':name,'command':cmd,'startedAt':started,'exitCode':run.returncode,'TMPDIR':env['TMPDIR']}
    if name=='importer-1208':
        text=out.read_text();summary={k:int(v) for k,v in re.findall(r'^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$',text,re.M)}
        record['summary']=summary
        expected=json.loads((e/'required-passing-names.json').read_text())['importer']['names']
        names=re.findall(r'^\s*ok \d+ - (.*)$',text,re.M)
        record['exactNamesMatch']=Counter(names)==Counter(expected)
        assert run.returncode==0 and record['exactNamesMatch'] and summary=={'tests':1208,'pass':1208,'fail':0,'cancelled':0,'skipped':0,'todo':0}
    records.append(record);(e/'local-results.json').write_text(json.dumps(records,indent=2)+'\n')
    print(json.dumps(record),flush=True)
