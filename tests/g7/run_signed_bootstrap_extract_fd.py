"""Single-process stdlib-only bounded regression entrypoint."""
import os
from pathlib import Path
import resource
import runpy
import signal
import sys

sys.dont_write_bytecode = True
resource.setrlimit(resource.RLIMIT_AS, (268435456, 268435456))
resource.setrlimit(resource.RLIMIT_CPU, (10, 10))
resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
resource.setrlimit(resource.RLIMIT_FSIZE, (65536, 65536))
resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
signal.alarm(20)
# No subprocess/thread/network operation is allowed in this focused runner.
def audit(event, args):
    if event.startswith(('socket.', 'subprocess.', 'os.exec', 'os.spawn', 'os.fork')):
        raise RuntimeError('non-native regression forbids process/network operations')
sys.addaudithook(audit)
print('BOUNDS AS=268435456 CPU=10 FD=64 FSIZE=65536 WALL=20; single process', flush=True)
sys.argv = ['test_signed_bootstrap_extract_fd.py']
runpy.run_path(str(Path(__file__).with_name('test_signed_bootstrap_extract_fd.py')), run_name='__main__')
