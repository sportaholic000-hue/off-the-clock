"""Archive only this integration's generated evidence; verify every byte."""
import gzip
import hashlib
import io
import json
import pathlib
import tarfile

root = pathlib.Path(__file__).resolve().parent
digest = lambda content: hashlib.sha256(content).hexdigest()
archive_index = []
matrix = root / 'original-161'
wire_files = sorted(matrix.glob('*.json.gz'))
if not wire_files:
    raise SystemExit('Original audit wire evidence is missing')
archive = matrix / 'wire-evidence.tar.gz'
if archive.exists():
    raise SystemExit('Refusing to overwrite an earlier archive')
with archive.open('wb') as raw, gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as compressed:
    with tarfile.open(fileobj=compressed, mode='w') as tar:
        for source in wire_files:
            content = source.read_bytes()
            info = tarfile.TarInfo(source.name)
            info.size = len(content)
            info.mode = 0o644
            tar.addfile(info, io.BytesIO(content))
            archive_index.append({'member': source.name, 'bytes': len(content), 'sha256': digest(content),
                                  'uncompressed_sha256': digest(gzip.decompress(content))})
with tarfile.open(archive, 'r:gz') as tar:
    assert set(tar.getnames()) == {row['member'] for row in archive_index}
    for row in archive_index:
        content = tar.extractfile(row['member']).read()
        assert digest(content) == row['sha256']
        assert digest(gzip.decompress(content)) == row['uncompressed_sha256']
(matrix / 'wire-evidence-index.json').write_text(json.dumps({'archive': archive.name,
    'archive_sha256': digest(archive.read_bytes()), 'verified_members': archive_index}, indent=2) + '\n')
for source in wire_files:
    source.unlink()

sources = sorted(root.glob('*.tap')) + sorted(root.glob('*.log'))
sources += [root / name for name in ['incoming-a1-name-audit.json', 'local-name-audit-initial.json',
    'local-name-audit.json', 'observations.json', 'receipts.sqlite']]
compressed_index = []
for source in sources:
    if not source.is_file():
        raise SystemExit('Required generated evidence is missing: ' + str(source))
    destination = pathlib.Path(str(source) + '.gz')
    if destination.exists():
        raise SystemExit('Refusing to overwrite ' + str(destination))
    content = source.read_bytes()
    with destination.open('wb') as raw, gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as stream:
        stream.write(content)
    assert gzip.decompress(destination.read_bytes()) == content
    compressed_index.append({'original_path': source.name, 'archive_path': destination.name,
        'original_bytes': len(content), 'sha256': digest(content),
        'archive_sha256': digest(destination.read_bytes())})
    source.unlink()
(root / 'evidence-archives.json').write_text(json.dumps({'compressed': compressed_index,
    'original_audit_archive': str(archive.relative_to(root)), 'wire_members': len(archive_index),
    'all_readback_verified': True}, indent=2) + '\n')
print(json.dumps({'compressed_files': len(compressed_index), 'wire_members': len(archive_index),
                  'archive_bytes': archive.stat().st_size, 'all_readback_verified': True}))
