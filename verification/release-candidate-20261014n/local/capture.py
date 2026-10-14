import datetime,json,os,pathlib,subprocess,sys
base=pathlib.Path(__file__).resolve().parent
label,cwd,*argv=sys.argv[1:]
meta={'argv':argv,'cwd':cwd,'startedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),
      'environment':{k:os.environ[k] for k in ['PATH','TMPDIR','NODE_ENV','CI','PLAYWRIGHT_BROWSERS_PATH'] if k in os.environ}}
with (base/(label+'.stdout.txt')).open('wb') as out,(base/(label+'.stderr.txt')).open('wb') as err:
    try:
        p=subprocess.Popen(argv,cwd=cwd,stdout=out,stderr=err);meta['pid']=p.pid
        code=p.wait();meta['exitCode']=code if code>=0 else None;meta['signal']=-code if code<0 else None
    except OSError as e:
        meta.update(exitCode=None,signal=None,launchError=repr(e));code=127
meta['finishedUTC']=datetime.datetime.now(datetime.timezone.utc).isoformat()
(base/(label+'.meta.json')).write_text(json.dumps(meta,indent=2)+'\n')
print(json.dumps(meta));print((base/(label+'.stdout.txt')).read_text(errors='replace')[-2500:]);print((base/(label+'.stderr.txt')).read_text(errors='replace')[-2500:])
sys.exit(code if code>=0 else 1)
