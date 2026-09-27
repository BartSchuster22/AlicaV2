"""Adapter-only, fail-closed aggregate grant. No secrets or prompts stored.

Operator creates this ledger ONCE outside the repository. Dispatch commits before
network I/O; uncertain/failed requests remain consumed. Missing/corrupt ledgers
never recreate a grant. This is not a provider-side billing limit.
"""
import os
import sqlite3
from contextlib import closing
from pathlib import Path

GRANT = 'phase3-owner-codex-gpt-5.6-sol-3-total'


class BudgetDenied(RuntimeError):
    pass


def initialize(path):
    """Explicit first provisioning only; never overwrite an existing ledger."""
    path = Path(path)
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(fd)
    # An interrupted initialization leaves a closed grant, not a fresh grant.
    with closing(sqlite3.connect(path)) as db, db:
        db.execute('PRAGMA synchronous=FULL')
        db.execute('CREATE TABLE grant_state (id INTEGER PRIMARY KEY CHECK(id=1), grant_id TEXT NOT NULL, used INTEGER NOT NULL CHECK(used BETWEEN 0 AND 3))')
        db.execute('INSERT INTO grant_state VALUES (1, ?, 0)', (GRANT,))


def consume(path):
    """Durably reserve exactly one request before dispatch. Never refund."""
    path = Path(path).absolute()
    db = None
    try:
        # mode=rw is essential: no implicit reinitialization if state disappears.
        db = sqlite3.connect(path.as_uri() + '?mode=rw', uri=True, timeout=1)
        db.execute('PRAGMA synchronous=FULL')
        db.execute('BEGIN IMMEDIATE')
        row = db.execute('SELECT grant_id, used FROM grant_state WHERE id=1').fetchone()
        if row is None or row[0] != GRANT or type(row[1]) is not int or not 0 <= row[1] < 3:
            raise BudgetDenied('RESOURCE_EXHAUSTED')
        used = row[1] + 1
        db.execute('UPDATE grant_state SET used=? WHERE id=1', (used,))
        db.commit()
        return used
    except (sqlite3.Error, OSError, ValueError) as exc:
        raise BudgetDenied('FAILED_PRECONDITION') from None
    finally:
        if db is not None:
            db.close()


class DispatchGuard:
    """Wrap the actual wire boundary, not the agent's turn counter.

    A failed wire call poisons this task so upstream retry paths cannot dispatch
    again. Successful tool-followup calls share the durable aggregate grant.
    The binding must fix endpoint/model, disable SDK retries and use this wrapper
    for EVERY inference path; this helper alone does not establish that property.
    """
    def __init__(self, ledger, send):
        self.ledger, self.send, self.poisoned = ledger, send, False

    def __call__(self, **kwargs):
        if self.poisoned:
            raise BudgetDenied('UNAVAILABLE')
        if kwargs.get('model') != 'gpt-5.6-sol':
            raise BudgetDenied('PERMISSION_DENIED')
        # Owner approved Codex without a provider-side output/billing ceiling.
        # This route rejects output-token parameters; never inject or forward one.
        if any(k in kwargs for k in ('max_tokens', 'max_completion_tokens', 'max_output_tokens')):
            raise BudgetDenied('PERMISSION_DENIED')
        consume(self.ledger)
        try:
            return self.send(**kwargs)
        except BaseException:
            self.poisoned = True
            raise
