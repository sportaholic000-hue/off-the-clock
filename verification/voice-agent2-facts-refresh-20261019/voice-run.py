"""Run a synthetic verification command without overwriting prior evidence."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

root = Path(__file__).resolve().parent
label, *command = sys.argv[1:]
if not re.fullmatch(r"[a-z0-9-]+", label) or not command:
    raise SystemExit("Usage: voice-run.py UNIQUE-LABEL COMMAND [ARG ...]")
log = root / (label + ".tap")
receipt = root / (label + ".json")
if receipt.exists() or log.exists() or log.with_suffix(".tap.gz").exists():
    raise SystemExit("Refusing to overwrite existing evidence")
env = dict(os.environ)
runtime = Path('/workspace/scratch/754089be5e74/qe-integration-runtime/node_modules/.bin')
if runtime.exists():
    env['PATH'] = str(runtime) + os.pathsep + env['PATH']
browser_path = Path('/workspace/scratch/754089be5e74/qe-integration-browsers')
if browser_path.exists():
    env['PLAYWRIGHT_BROWSERS_PATH'] = str(browser_path)
scratch = Path('/workspace/scratch/754089be5e74/voice-facts-tmp')
if scratch.parent.exists():
    scratch.mkdir(exist_ok=True)
    env['TMPDIR'] = str(scratch)
start = datetime.datetime.now(datetime.timezone.utc).isoformat()
tracked_sources = [Path('server/src/voice/googleGenAiLiveAdapter.js'), Path('server/src/voice/productionVoiceRuntime.js'), Path('server/src/voice/geminiMediaBridge.js')]
source_files = tracked_sources + sorted(Path('test').glob('voiceAgent2FactsRefresh*.mjs'))
source_hashes = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in source_files}
with log.open('xb') as output:
    result = subprocess.run(command, env=env, stdout=output, stderr=subprocess.STDOUT)
data = log.read_bytes()
summary = dict((key, float(value) if '.' in value else int(value)) for key, value in
               re.findall(r'^# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\s+([0-9.]+)$', data.decode('utf8', 'replace'), re.M))
record = dict(command=command, started_at=start,
              finished_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
              head=subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
              changed_paths=subprocess.check_output(['git', 'diff', '--name-only'], text=True).splitlines(),
              source_sha256=source_hashes,
              exit_code=result.returncode, summary=summary, log=log.name,
              log_bytes=len(data), log_sha256=hashlib.sha256(data).hexdigest())
with receipt.open('x') as output:
    json.dump(record, output, indent=2)
    output.write('\n')
print(json.dumps(record))
raise SystemExit(result.returncode)
