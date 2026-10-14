"""Harmless tracer capability check; no application import."""
import json
import os
from pathlib import Path
import subprocess
import sys

if len(sys.argv) == 3 and sys.argv[1] == '--child':
    target = Path(sys.argv[2])
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.write(fd, b'SYNTHETIC_TRACE_CAPABILITY\n')
    os.close(fd)
    renamed = target.with_suffix('.renamed')
    os.rename(target, renamed)
    os.utime(renamed, ns=(1_700_000_000_000_000_000,) * 2)
    os.unlink(renamed)
    print(json.dumps({'pid': os.getpid(), 'ppid': os.getppid(), 'path': str(target), 'operations': ['write', 'rename', 'utime', 'unlink']}))
else:
    result = subprocess.run([sys.executable, __file__, '--child', sys.argv[1]], check=False)
    sys.exit(result.returncode)
