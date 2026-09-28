"""Test-only native failure process. Synthetic wire/disposable state; never live."""
import json
from pathlib import Path
import sys
from unittest.mock import patch

import offline_entry
import native_binding as native
from request_budget import BudgetDenied

CANARY = 'SYNTHETIC_TOOL_FAILURE_NOT_A_SECRET'


def main():
    root = Path(sys.argv[1])
    real_bind = native.bind_native
    failures = []

    def failing_bind(*args, **kwargs):
        agent, guard, calls = real_bind(*args, **kwargs)
        from tools.registry import registry

        def fail(*args, **kwargs):
            failures.append(native.TOOL)
            raise RuntimeError(CANARY)

        registry.register(name=native.TOOL, toolset='phase3_fixture',
                          schema=native.SCHEMA, handler=fail)
        return agent, guard, calls

    with patch.object(offline_entry, 'bind_native', failing_bind):
        try:
            offline_entry.main()
        except (AssertionError, BudgetDenied):
            if failures != [native.TOOL]:
                return 2
            # Only a fixed, nonsecret dispatch receipt; no exception text/context.
            (root / 'mock-tool-dispatch.json').write_text(json.dumps(
                {'mode': 'MOCK', 'nativeToolInvocations': 1, 'failed': True}))
            return 1  # Real runner maps failed child to public UNAVAILABLE.
    return 2


if __name__ == '__main__':
    try:
        status = main()
    except BaseException:
        status = 2
    sys.exit(status)
