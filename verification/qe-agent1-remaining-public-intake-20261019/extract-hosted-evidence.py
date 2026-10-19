"""Extract lossless A1 bundles from a downloaded ordinary GitHub job log."""
import base64
import gzip
import hashlib
import json
import pathlib
import re
import sys

source, target = map(pathlib.Path, sys.argv[1:3])
if target.exists():
    raise SystemExit(f"Refusing to overwrite evidence: {target}")
target.mkdir(parents=True)
groups, pending, expected = [], [], 0
if source.suffix == ".gz":
    # A previously extracted complete bundle retains the exact compressed bytes.
    groups = [source.read_bytes()]
else:
    for match in re.finditer(r"A1_REVIEW_EVIDENCE (\d+)/(\d+) ([A-Za-z0-9+/=]+)", source.read_text()):
        number, total = map(int, match.group(1, 2))
        if number == 1:
            if pending:
                raise ValueError("Incomplete preceding evidence bundle")
            expected = total
        if total != expected or number != len(pending) + 1:
            raise ValueError("Missing, repeated or unordered evidence chunk")
        pending.append(match.group(3))
        if number == total:
            groups.append(base64.b64decode("".join(pending), validate=True))
            pending = []
    if pending or not groups:
        raise ValueError("No complete evidence bundle")
summary = []
for number, compressed in enumerate(groups, 1):
    directory = target / f"run-{number:02d}"
    directory.mkdir()
    (directory / "hosted-bundle.json.gz").write_bytes(compressed)
    files = json.loads(gzip.decompress(compressed))
    hashes = {}
    for name, item in files.items():
        if pathlib.Path(name).name != name or name in (".", ".."):
            raise ValueError("Unexpected bundle path")
        if item["encoding"] == "utf8":
            data = item["content"].encode()
        elif item["encoding"] == "base64":
            data = base64.b64decode(item["content"], validate=True)
        else:
            raise ValueError("Unexpected bundle encoding")
        (directory / name).write_bytes(data)
        hashes[name] = hashlib.sha256(data).hexdigest()
    (directory / "extracted-sha256.json").write_text(json.dumps(hashes, indent=2) + "\n")
    summary.append({"directory": directory.name, "result": json.loads((directory / "result.json").read_text()), "files": len(files)})
(target / "extraction.json").write_text(json.dumps(summary, indent=2) + "\n")
print(json.dumps(summary, indent=2))
