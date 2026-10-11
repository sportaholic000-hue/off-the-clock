"""One sequential, bounded process tree owns the local gate logs."""
import json, os, pathlib, re, signal, subprocess, threading, time
folder=pathlib.Path(__file__).resolve().parent
results=[]
for label,command in [('build',['npm','run','build']),('full',['npm','test']),('quote',['npm','run','test:quote'])]:
    print('START '+label,flush=True)
    env=os.environ.copy();env['TEST_RESULTS_FILE']=str(folder.relative_to(pathlib.Path.cwd())/'sequential-full.tap')
    log=folder/('sequential-'+label+'.log')
    process=subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,env=env,start_new_session=True)
    def consume():
        with log.open('w') as output:
            for line in process.stdout:
                output.write(line);output.flush()
                match=re.match(r'^ok (\d+) - (.+)',line)
                if match and int(match[1])%500==0:print(label+': '+line.strip(),flush=True)
                if re.match(r'^# (tests|pass|fail|skipped|cancelled|todo) ',line):print(label+': '+line.strip(),flush=True)
    reader=threading.Thread(target=consume,daemon=True);reader.start()
    timed_out=False
    try:status=process.wait(timeout=900)
    except subprocess.TimeoutExpired:
        timed_out=True;os.killpg(process.pid,signal.SIGKILL);status=process.wait()
    reader.join(timeout=10)
    counts={k:int(v) for k,v in re.findall(r'^# (tests|pass|fail|skipped|cancelled|todo) (\d+)$',log.read_text(),re.M)}
    row={'label':label,'command':command,'exit':status,'timeout':timed_out,**counts};results.append(row)
    print('DONE '+json.dumps(row),flush=True)
(folder/'sequential-results.json').write_text(json.dumps(results,indent=2)+'\n')
