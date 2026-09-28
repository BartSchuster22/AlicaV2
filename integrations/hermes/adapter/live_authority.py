"""Live-only preflight. No provisioning, credentials, or network operations.

One original live attempt, not a retry grant. A durable attempt marker remains
on failure, cancellation and success. Followups belong to that same process and
consume the original SQLite budget. Tests use disposable directories explicitly;
production entrypoints must use ORIGINAL_DIRECTORY, never a temporary grant.
"""
import json
import os
from pathlib import Path
import sqlite3
import stat
from contextlib import closing

from request_budget import BudgetDenied, GRANT

ORIGINAL_DIRECTORY = Path('/home/alica-dev/phase3-live-grant')
LEDGER_NAME = 'original-approved3total.sqlite'
ATTEMPT_NAME = 'original-live-attempt.json'


def _deny():
    raise BudgetDenied('FAILED_PRECONDITION')


def _private_directory(directory):
    directory = Path(directory)
    if not directory.is_absolute():
        _deny()
    # No ancestor symlink, including links whose target currently exists.
    for part in [directory, *directory.parents]:
        if part.is_symlink():
            _deny()
    info = directory.stat()
    if (not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid()
            or stat.S_IMODE(info.st_mode) != 0o700):
        _deny()
    return directory


def inspect_original(directory=ORIGINAL_DIRECTORY):
    """Read-only preflight; never infer an unused grant from a missing file."""
    try:
        directory = _private_directory(directory)
        ledger = directory / LEDGER_NAME
        info = ledger.lstat()
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid()
                or info.st_nlink != 1 or stat.S_IMODE(info.st_mode) != 0o600):
            _deny()
        with closing(sqlite3.connect(ledger.as_uri() + '?mode=ro', uri=True)) as db:
            rows = db.execute('SELECT id, grant_id, used FROM grant_state').fetchall()
        if rows != [(1, GRANT, 0)]:
            # A new task may not treat remaining calls as authority to retry.
            _deny()
        marker = directory / ATTEMPT_NAME
        if marker.exists() or marker.is_symlink():
            _deny()
        return ledger
    except (OSError, sqlite3.Error, ValueError):
        raise BudgetDenied('FAILED_PRECONDITION') from None


def claim_original_attempt(directory=ORIGINAL_DIRECTORY):
    """Call before credential access. Never delete/rewrite the returned marker.

    Directory and ledger must already have been explicitly provisioned following
    historical reconciliation. Exclusive durable claim prevents task restart
    after uncertain failure. This is NOT the physical-dispatch counter itself.
    Trusted single operator owns this private directory; no hostile-user sandbox
    or protection against an operator deliberately replacing state is claimed.
    """
    ledger = inspect_original(directory)
    directory = ledger.parent
    marker = directory / ATTEMPT_NAME
    record = json.dumps({'grant_id': GRANT, 'ledger': str(ledger),
                         'status': 'attempt-claimed-no-restart',
                         'maximum_total_physical_calls': 3}) + '\n'
    fd = None
    try:
        fd = os.open(marker, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            fd = None
            stream.write(record)
            stream.flush()
            os.fsync(stream.fileno())
        parent = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
        return ledger
    except OSError:
        # Even an incomplete marker closes the attempt. Never unlink on failure.
        raise BudgetDenied('FAILED_PRECONDITION') from None
    finally:
        if fd is not None:
            os.close(fd)
