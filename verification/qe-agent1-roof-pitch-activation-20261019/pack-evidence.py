"""Pack complete wire evidence, preserving each decompressed JSON byte-for-byte.
Only completed audit runs inside this owned directory are eligible. The archive
manifest and readback check precede removing redundant per-case gzip wrappers.
"""
from pathlib import Path
import gzip,hashlib,io,json,tarfile
root=Path(__file__).resolve().parent
for directory in sorted(root.iterdir()):
 if not directory.is_dir() or not (directory/'summary.json').exists(): continue
 files=sorted(directory.glob('*.json.gz'))
 if not files: continue
 dest=directory/'evidence.tar.gz'
 if dest.exists(): raise RuntimeError('Refusing to replace '+str(dest))
 payload={p.name[:-3]:gzip.decompress(p.read_bytes()) for p in files}
 with dest.open('wb') as raw,gzip.GzipFile(fileobj=raw,mode='wb',mtime=0) as gz,tarfile.open(fileobj=gz,mode='w') as archive:
  for name,data in payload.items():
   info=tarfile.TarInfo(name);info.size=len(data);info.mtime=0;archive.addfile(info,io.BytesIO(data))
 with tarfile.open(dest,'r:gz') as archive:
  for name,data in payload.items(): assert archive.extractfile(name).read()==data
 (directory/'evidence-index.json').write_text(json.dumps({name:{'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()} for name,data in payload.items()},indent=2)+'\n')
 for p in files:p.unlink()
 print(directory.name,len(files),dest.stat().st_size)
