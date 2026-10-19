import hashlib,json,subprocess
from pathlib import Path
root=Path.cwd();e=Path(__file__).resolve().parent
base='03ebb1a9acd0c36381ef166c7c9e78ca2e551ca3';workflow='.github/workflows/ci.yml'
def git(*args):return subprocess.check_output(['git',*args],text=True)
old={}
for row in git('ls-tree','-r',base).splitlines():
    meta,path=row.split('\t',1);mode,typ,blob=meta.split();old[path]=(mode,blob)
index={}
for row in git('ls-files','--stage').splitlines():
    meta,path=row.split('\t',1);mode,blob,stage=meta.split();assert stage=='0',path;index[path]=(mode,blob)
before=subprocess.check_output(['git','show',base+':'+workflow]);after=(root/workflow).read_bytes()
assert before.count(b'    timeout-minutes: 45\n')==1
assert after==before.replace(b'    timeout-minutes: 45\n',b'    timeout-minutes: 60\n',1)
assert index[workflow]==(old[workflow][0],git('hash-object',workflow).strip())
for path,entry in old.items():
    if path!=workflow:assert index.get(path)==entry,path
assert not git('diff','--name-only').strip()
extra=set(index)-set(old)
assert all(path.startswith('verification/qe-agent4-ci-headroom-20261019/') for path in extra),extra
result={'base':base,'existingFiles':len(old),'unchangedExistingBlobsAndModes':len(old)-1,
        'onlyChangedExistingFile':workflow,'exactReplacement':{'from':'    timeout-minutes: 45','to':'    timeout-minutes: 60'},
        'allOtherExistingFilesUnchanged':True,'oldWorkflowSha256':hashlib.sha256(before).hexdigest(),
        'newWorkflowSha256':hashlib.sha256(after).hexdigest(),'expectedCounts':{'strict':6164,'full':8129,'browser':12}}
(e/'preservation.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
