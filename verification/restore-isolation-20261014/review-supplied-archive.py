#!/usr/bin/env python3
"""Read existing evidence; do not execute tests or import the application."""
import datetime, hashlib, io, json, pathlib, re, subprocess, sys, tarfile, zipfile

archive, repo, output = map(pathlib.Path, sys.argv[1:])
sha = '95e1631f42461ca8ae7d46d859940bffc302d155'
expected = 'bc944f6c275caeec5f110e8cc1694f303a1af8bdae14adf622e85ffb02d72a74'
digest = lambda b: hashlib.sha256(b).hexdigest()
started = datetime.datetime.now(datetime.timezone.utc).isoformat()

def verify_zip(data):
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        assert z.testzip() is None
        names = z.namelist()
        assert len(names) == len(set(names))
        manifest = next(n for n in names if n.endswith('INVENTORY.json'))
        prefix = manifest[:-len('INVENTORY.json')]
        inventory = json.loads(z.read(manifest))
        payload = []
        for row in inventory['files']:
            name = row['path'] if row['path'] in names else prefix + row['path']
            b = z.read(name)
            assert len(b) == row['bytes'] and digest(b) == row['sha256'], name
            payload.append(name)
        sums = next(n for n in names if n.endswith('SHA256SUMS'))
        sum_count = 0
        for line in z.read(sums).decode().splitlines():
            h, name = line.split('  ', 1)
            name = name if name in names else prefix + name
            assert digest(z.read(name)) == h, name
            sum_count += 1
        assert set(names) == set(payload + [manifest, sums])
        return dict(bytes=len(data), sha256=digest(data), zipEntries=len(names),
                    verifiedInventoryFiles=len(payload), verifiedChecksumLines=sum_count,
                    crc='PASS', exactInventoryMembership='PASS')

data = archive.read_bytes()
assert digest(data) == expected
result = dict(startedUTC=started, command=[sys.executable, *sys.argv], cwd=str(pathlib.Path.cwd()),
              operation='Read-only archive/source verification; no application executions',
              archive=verify_zip(data), nestedArchives=[], immutableApplication=sha)
with zipfile.ZipFile(io.BytesIO(data)) as z:
    for name, h in [
        ('provided-originals/INCOMPLETE-original-engine-pricebook-rc-20261013m.zip',
         'b4dd3bbc86308b4879f127093fb4ef6a9a09c25ce74b2c84ce2b3f0209ad04d8'),
        ('provided-originals/restore-diagnosis-rc-20261013m.zip',
         'bda2c534f9743dcd9232617904059f4031d187b4a0cbe34920d57ae032ec410e')]:
        b = z.read(name)
        assert digest(b) == h
        result['nestedArchives'].append(dict(path=name, **verify_zip(b)))
    with tarfile.open(fileobj=io.BytesIO(z.read('tagged-source-selected.tar.gz'))) as t:
        sources = {m.name:t.extractfile(m).read() for m in t.getmembers() if m.isfile()}
    refs = ''.join(sha + ':' + p + '\n' for p in sources).encode()
    proc = subprocess.run(['git','cat-file','--batch'], cwd=repo, input=refs, capture_output=True, check=True)
    stream = io.BytesIO(proc.stdout)
    for path, b in sources.items():
        header = stream.readline().decode().split()
        assert len(header)==3 and header[1]=='blob', path
        actual = stream.read(int(header[2])); assert stream.read(1)==b'\n'
        assert b == actual, path
    result['taggedSourceComparison'] = dict(verifiedFiles=len(sources), byteIdentical=True,
        method='git cat-file --batch against immutable commit; archived files never executed')
    result['suppliedReport'] = dict(path='Full_Audit_rc-20261013m.md',
        sha256=digest(z.read('Full_Audit_rc-20261013m.md')),
        verdict='INCOMPLETE; no confirmed SHARE; historical restore/provenance unresolved')
    result['priorLocalSuites'] = []
    for label in ['07-full-suite','08-quote-suite']:
        text = z.read('evidence/'+label+'.stdout.txt').decode()
        counts = dict((k,int(v)) for k,v in re.findall(r'^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$',text,re.M))
        start = text.index('# Subtest: production backup/restore rehearsal uses real approved quotes, leads and confirmed bookings')
        end = text.index('# Whole-volume loss simulated;',start)
        block = text[start:end]
        passes = re.findall(r'^\s*ok \d+ - (.+)$',block,re.M)
        assert len(passes)==9 and not re.search(r'^\s*not ok ',block,re.M)
        result['priorLocalSuites'].append(dict(name=label, metadata=json.loads(z.read('evidence/'+label+'.meta.json')),
                                               completeSummary=counts, restorePassNames=passes))
    http = json.loads(z.read('evidence/http-results-corrected-v4.json'))
    result['priorLiveBookCheck'] = dict(passed=http['passed'], storageObservations=http['storageObservations'],
        requestCount=len(http['requests']), scope='Application already running; not a recreation of child-start reappearance')
    result['priorHostedRecordedValidation'] = json.loads(z.read('evidence/ci-final-independent-validation.json'))
    run = json.loads(z.read('evidence/ci-run.json'))
    jobs = json.loads(z.read('evidence/ci-attempt-1-jobs-raw.json'))['jobs']
    requirements = json.loads(z.read('evidence/ci-personal-inspection.json'))['requiredOutcomes']
    assert run['id']==38487031799 and run['run_attempt']==1 and run['head_sha']==sha
    verified = []
    for row in requirements:
        job = next(j for j in jobs if j['name']==row['job'])
        step = next(s for s in job['steps'] if s['name']==row['step'])
        assert job['head_sha']==sha and job['run_id']==38487031799 and job['run_attempt']==1
        assert step['status']=='completed' and step['conclusion']=='success'
        verified.append(dict(jobId=job['id'], job=job['name'], step=step['name'], conclusion=step['conclusion']))
    assert len(verified)==27
    hosted_log = z.read('evidence/ci-job-115603043704.txt').decode()
    hosted_summaries = []
    for counts in result['priorHostedRecordedValidation']['exactHostedSummaries']:
        lines = counts['originalLines']
        assert all(line in hosted_log for line in lines)
        hosted_summaries.append(lines)
    result['priorHostedArchiveCrosscheck'] = dict(requiredOutcomes=verified, completeSummaryLinesFound=hosted_summaries,
        limitation='Archived original metadata/log inspection only; no new hosted execution or release qualification')
    result['rehearsalSources'] = {p:digest(sources[p]) for p in ['test/backupRestoreRehearsal.spec.mjs','test/helpers/backupRestoreProcess.mjs']}

result['limitations'] = [
    'Integrity and source matching do not establish historical capture time, continuity or writer identity.',
    'Existing archived execution results were inspected, not rerun or represented as newly constructed probes.',
    'The original audit verdict remains INCOMPLETE; targeted hosted verification is a separate PASS.',
    'No new explanation for the 27 historical temporary-tree files; no database snapshot claimed.'
]
result['finishedUTC'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
output.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'archive':result['archive'],'nestedArchives':result['nestedArchives'],
                  'sources':result['taggedSourceComparison'],'output':str(output)},indent=2))
