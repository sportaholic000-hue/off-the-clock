from pathlib import Path
import subprocess,os,sys,json,datetime,hashlib,re

root=Path(__file__).resolve().parents[2]
label=sys.argv[1]
assert re.fullmatch(r'[a-z0-9-]+',label)
argv=sys.argv[2:]
out=root/'verification/qe-lane-c-20261016/runs'
out.mkdir(parents=True,exist_ok=True)
record=out/(label+'.execution.json')
assert not record.exists(), 'Never overwrite an earlier execution'
stamp=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
def run(args):return subprocess.run(args,cwd=root,text=True,capture_output=True)
versions={name:run(cmd).stdout.strip() for name,cmd in [('node',['node','--version']),('npm',['npm','--version']),('git',['git','--version']),('python',['python','--version'])]}
sources=set(run(['git','diff','--name-only','--','server','client/src','test','scripts']).stdout.splitlines())
sources.update(run(['git','ls-files','--others','--exclude-standard','--','server','client/src','test','scripts']).stdout.splitlines())
hashes=[]
for name in sorted(sources):
 p=root/name
 if not p.is_file():continue
 data=p.read_bytes();target=out/(label+'-source')/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
 hashes.append({'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
(out/(label+'.sources.json')).write_text(json.dumps(hashes,indent=2)+'\n')
(out/(label+'.source.diff')).write_text(run(['git','diff','--binary','--','server','client/src','test','scripts']).stdout)
metadata={'argv':argv,'cwd':str(root),'startedUTC':stamp(),'versions':versions,'configuration':{key:os.environ[key] for key in ['TMPDIR','CI','TZ','PLAYWRIGHT_BROWSERS_PATH'] if key in os.environ},'head':run(['git','rev-parse','HEAD']).stdout.strip()}
record.write_text(json.dumps(metadata,indent=2)+'\n')
print('START '+label+' '+metadata['startedUTC'],flush=True)
with (out/(label+'.stdout.log')).open('wb') as stdout,(out/(label+'.stderr.log')).open('wb') as stderr:
 try:
  p=subprocess.Popen(argv,cwd=root,stdout=stdout,stderr=stderr)
  metadata['pid']=p.pid
  record.write_text(json.dumps(metadata,indent=2)+'\n')
  code=p.wait();metadata.update(exitCode=code if code>=0 else None,signal=-code if code<0 else None)
 except Exception as error:
  metadata.update(exitCode=None,signal=None,launchError=repr(error));code=1
metadata['finishedUTC']=stamp()
record.write_text(json.dumps(metadata,indent=2)+'\n')
print(json.dumps(metadata,indent=2),flush=True)
stdout=(out/(label+'.stdout.log')).read_text(errors='replace')
for line in stdout.splitlines():
 if re.match(r'^# (tests|suites|pass|fail|cancelled|skipped|todo) ',line):print(line)
if code:
 print('FAILURE TAIL (complete streams preserved):',flush=True)
 print(stdout[-9000:])
 print((out/(label+'.stderr.log')).read_text(errors='replace')[-5000:])
sys.exit(code if code and code>0 else 1 if code<0 else 0)
