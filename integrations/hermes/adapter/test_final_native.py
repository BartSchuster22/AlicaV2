"""H8/H14/H17: real pinned native runtime, synthetic wire, disposable state only."""
import contextlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

CANARY = 'SYNTHETIC_TOOL_FAILURE_NOT_A_SECRET'


def child(case, root):
    import httpx
    from openai import OpenAI
    import native_binding as native
    from request_budget import BudgetDenied, initialize
    if case == 'tool-failure':
        import offline_entry
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
        # Real AIAgent/native dispatch. Only fixture handler fault injection and
        # synthetic model wire; no original live entrypoint/grant is invoked.
        with patch.object(offline_entry, 'bind_native', failing_bind), \
                patch.object(sys, 'argv', ['offline_entry.py', root]), \
                patch.object(sys, 'stdin', io.StringIO(json.dumps({'task': native.FIXTURE_TASK}))):
            try:
                offline_entry.main()
            except (AssertionError, BudgetDenied):
                assert failures == [native.TOOL], 'native failure was not dispatched'
                print('MOCK_NATIVE_TOOL_FAILURE_NORMALIZED')
                return
            raise AssertionError('native tool failure accepted')
    workspace, _ = native.prepare_offline_child(root)
    ledger = Path(root) / 'mock.sqlite'
    initialize(ledger)
    sent = []
    client = OpenAI(api_key='mock-only', base_url=native.ENDPOINT, max_retries=0,
                    http_client=httpx.Client(transport=httpx.MockTransport(lambda r: sent.append(r))))
    try:
        if case == 'missing-config':
            (Path(os.environ['HERMES_HOME']) / 'config.yaml').unlink()
            scope = contextlib.nullcontext()
        elif case == 'invalid-config':
            (Path(os.environ['HERMES_HOME']) / 'config.yaml').write_text('{}')
            scope = contextlib.nullcontext()
        else:
            import run_agent  # complete native discovery before fixture fault injection
            from tools.registry import registry
            register = registry.register
            def fault(**kwargs):
                if kwargs['name'] == native.TOOL:
                    if case == 'absent-tool':
                        return
                    kwargs['check_fn'] = lambda: False
                return register(**kwargs)
            scope = patch.object(registry, 'register', fault)
        with scope:
            try:
                native.bind_native(client, ledger, workspace, deadline=time.monotonic()+30)
            except BudgetDenied as e:
                assert str(e) == 'FAILED_PRECONDITION'
            else:
                raise AssertionError('invalid dependency/config accepted')
        assert sent == []
        print('MOCK_NATIVE_PRECONDITION_PASS ' + case)
    finally:
        client.close()


class FinalNative(unittest.TestCase):
    def test_wrong_checkout_rejected_before_isolation(self):
        import native_binding as native
        from request_budget import BudgetDenied
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as root:
            source = Path(root) / 'source'
            source.mkdir()
            (source / 'run_agent.py').write_text('raise AssertionError("must not import")\n')
            def git(*args):
                subprocess.run(['/usr/bin/git', '-C', str(source), *args], check=True,
                               stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            git('init'); git('add', 'run_agent.py')
            git('-c', 'user.name=Mock', '-c', 'user.email=mock@example.invalid', 'commit', '-m', 'wrong version')
            request = Path(root) / 'request'; request.mkdir()
            with patch.object(native.importlib.util, 'find_spec', return_value=SimpleNamespace(origin=str(source/'run_agent.py'))):
                with self.assertRaises(BudgetDenied):
                    native.prepare_offline_child(request)
            self.assertEqual(list(request.iterdir()), [])
            self.assertNotIn('run_agent', sys.modules)

    def test_missing_runtime(self):
        import native_binding as native
        from request_budget import BudgetDenied
        with patch.object(native.importlib.util, 'find_spec', return_value=None):
            with self.assertRaises(BudgetDenied):
                native.verify_native_version()

    def test_missing_secret_is_not_provisioned(self):
        from live_entry import consume_auth
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaises(FileNotFoundError):
                consume_auth(root)
            self.assertEqual(list(Path(root).iterdir()), [])

    def test_native_failures(self):
        for case in ('absent-tool', 'disabled-tool', 'missing-config', 'invalid-config', 'tool-failure'):
            with self.subTest(case=case), tempfile.TemporaryDirectory() as root:
                run = subprocess.run([sys.executable, str(Path(__file__).resolve()), '--child', case, root],
                                     capture_output=True, timeout=60)
                self.assertEqual(run.returncode, 0, (run.stdout+run.stderr).decode()[-3000:])
                self.assertNotIn(CANARY.encode(), run.stdout + run.stderr)
                self.assertIn(b'MOCK_NATIVE_', run.stdout)
                # Tool error may be native in-memory model context, never a
                # public result. Persistent diagnostic artifacts must be clean.
                for p in Path(root).rglob('*'):
                    if p.is_file():
                        self.assertNotIn(CANARY.encode(), p.read_bytes())
                print('PASS MOCK native/' + case)


if __name__ == '__main__':
    if len(sys.argv) == 4 and sys.argv[1] == '--child':
        child(sys.argv[2], sys.argv[3])
    else:
        unittest.main(verbosity=2)
