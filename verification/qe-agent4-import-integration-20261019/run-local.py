import datetime,hashlib,json,os,re,subprocess
from pathlib import Path

root=Path.cwd();e=root/'verification/qe-agent4-import-integration-20261019'
prior=json.loads((root/'verification/qe-agent4-condition-extensions-review-20261019/after-commands.json').read_text())
importer=next(x['command'] for x in prior if x['name']=='combined-1208')
original=next(x['command'] for x in prior if x['name']=='after-original')
prefix=importer[:importer.index('--test-reporter=tap')+1]
quote_files=[
 'test/qeAgent1RoofPitchActivationChannels20261019.spec.mjs',
 'test/qeAgent1RoofPitchActivationHistorical20261019.spec.mjs',
 'test/qeAgent1RoofPitchActivationReadiness20261019.spec.mjs',
 'test/qeAgent1InteriorActivation20261019.spec.mjs',
 'test/qeAgent1InteriorDelivery20261019.spec.mjs',
 'test/qeAgent1InteriorHistorical20261019.spec.mjs',
 'test/qeAgent1ApprovalPrecision20261018.spec.mjs',
 'test/qeAgent2IntegrationF16PricePrecision20261019.spec.mjs',
 'test/qeAgent2PricePrecision.spec.mjs',
 'test/qeAgent2PriceMetadata.spec.mjs',
 'test/qeAgent3ScopePresentation20261018.spec.mjs',
 'test/qeAgent3WidgetDependencies20261019.spec.mjs'
]
browser_files=['test/qeAgent3WidgetDependencies20261019.browser.spec.mjs','test/qeAgent3RepresentativePublicIntake20261019.browser.spec.mjs']
assert all((root/p).is_file() for p in quote_files+browser_files)
env=dict(os.environ,TMPDIR=str(root.parent/'agent4-r1-r2-tmp'));env['PATH']=str(Path(importer[0]).parent)+os.pathsep+env['PATH']
runs=[('importer-1208',importer,False),('original-five',original,False),('quote-widget',prefix+quote_files,False),('build',['npm','run','build'],False),('widget-browser',prefix+browser_files,True)]
records=[]
for name,command,diagnostic in runs:
    path=e/(name+('.log' if name=='build' else '.tap'))
    record={'name':name,'command':command,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'environment':{'TMPDIR':env['TMPDIR'],'node':importer[0]},'sourceHashes':{p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in ['server/src/websitePriceExtraction.js','server/src/websitePriceImport.js','.github/workflows/ci.yml','server/quote-engine-vnext/engine.js']}}
    with path.open('w') as out:result=subprocess.run(command,env=env,stdout=out,stderr=subprocess.STDOUT)
    record['exitCode']=result.returncode
    record['summary']=dict(re.findall(r'^# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) (\S+)$',path.read_text(),re.M))
    records.append(record);(e/'local-commands.json').write_text(json.dumps(records,indent=2)+'\n')
    print(json.dumps({'name':name,'exitCode':result.returncode,'summary':record['summary']}),flush=True)
    if not diagnostic:assert result.returncode==0,(name,result.returncode)
