"""Extract a complete source-bound A1 widget bundle; never overwrite evidence."""
import base64
import gzip
import hashlib
import json
import pathlib
import re
import sys

source, target = map(pathlib.Path, sys.argv[1:3])
if target.exists():
    raise SystemExit('Refusing to overwrite evidence: '+str(target))
if source.name.endswith('.gz'):
    compressed = source.read_bytes()
else:
    bundles = []
    current = {}
    total = None
    for line in source.read_text().splitlines():
        match = re.search(r'A1_WIDGET_ENTRY_EVIDENCE (\d+)/(\d+) ([A-Za-z0-9+/=]+)', line)
        if not match:
            continue
        number, count = map(int, match.group(1, 2))
        if number == 1 and current:
            bundles.append((total, current))
            current = {}
        if total != count and current:
            raise SystemExit('Inconsistent chunk count')
        total = count
        if number in current and current[number] != match.group(3):
            raise SystemExit('Conflicting evidence chunk')
        current[number] = match.group(3)
    if current:
        bundles.append((total, current))
    complete = [(n, chunks) for n, chunks in bundles if set(chunks) == set(range(1, n+1))]
    if len(complete) != 1:
        raise SystemExit('Provide exactly one complete invocation; found '+str(len(complete)))
    n, chunks = complete[0]
    compressed = base64.b64decode(''.join(chunks[i] for i in range(1, n+1)), validate=True)
files = json.loads(gzip.decompress(compressed))  # validates gzip CRC
target.mkdir(parents=True)
hashes = {}
for name, entry in files.items():
    relative = pathlib.PurePosixPath(name)
    if relative.is_absolute() or '..' in relative.parts:
        raise SystemExit('Unsafe evidence path')
    data = entry['content'].encode() if entry['encoding'] == 'utf8' else base64.b64decode(entry['content'], validate=True)
    destination = target / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(data)
    hashes[name] = hashlib.sha256(data).hexdigest()
(target/'complete-evidence-bundle.json.gz').write_bytes(compressed)
(target/'extracted-sha256.json').write_text(json.dumps(hashes, indent=2))
print(json.dumps({'files':len(files),'bundleSha256':hashlib.sha256(compressed).hexdigest()}))
