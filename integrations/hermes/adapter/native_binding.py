"""Pinned, request-owned AIAgent binding. Offline qualification candidate.

No upstream file changes and no general plugin integration. Call only from a
fresh isolated child; never attach to an existing Hermes process/profile.
Owner approved Codex without a guaranteed provider output/billing cap. Live
provisioning still requires offline qualification. No credentials/grants here.
"""
import json
import os
from pathlib import Path
import sys
import time

from guarded_responses import GuardedResponses
from request_budget import BudgetDenied

_OFFLINE_READY = False
_BINDING_USED = False
MODEL = 'gpt-5.6-sol'
# Official authenticated Codex GET /models?client_version=99.0.0, HTTP200,
# 2026-09-27T19:55:04Z: exact slug context_window=272000 (max=872000).
# Use advertised default, not optional maximum. See MODEL-METADATA.md.
CONTEXT_LENGTH = 272000
ENDPOINT = 'https://chatgpt.com/backend-api/codex'
TOOL = 'phase3_fixture_read'
FIXTURE_TASK = 'Read the approved fixture and return its text exactly.'
FIXTURE = {'name': 'phase3-readonly', 'value': 'ALICA request-scoped fixture'}
SCHEMA = {'name': TOOL, 'description': 'Read the single immutable Phase3 fixture.',
          'parameters': {'type': 'object', 'properties': {},
                         'additionalProperties': False}}
CONFIG = {
    'model': {'provider': 'openai-codex', 'model': MODEL,
              'base_url': ENDPOINT, 'context_length': CONTEXT_LENGTH},
    'providers': {'openai-codex': {'request_timeout_seconds': 120}},
    'context': {'engine': 'compressor'},
    'compression': {'enabled': False, 'codex_responses_native': False},
    'agent': {'environment_probe': False, 'api_max_retries': 1,
              'auto_recovery_cycles': 0, 'intent_ack_continuation': False,
              'tool_use_enforcement': False, 'execution_guidance': False},
    # Pinned tools.tool_search._config_from_loader reads tools.tool_search.
    # Disable bridge assembly via supported config, not dispatch/catalog bypass.
    'tools': {'tool_search': {'enabled': 'off'}},
    'plugins': {'enabled': []},
}


def prepare_offline_child(root):
    """One-way process isolation, BEFORE any Hermes imports. No network allowed.

    Audit exclusions apply to trusted Python, not a hostile-code sandbox. Never
    remove the hook or turn network on in this process. Offline SDK traffic must
    use MockTransport. Blocking is deliberate even if optional discovery catches
    the exception; no ambient subprocess/network/credential operation completes.
    """
    if 'run_agent' in sys.modules or 'model_tools' in sys.modules:
        raise BudgetDenied('FAILED_PRECONDITION')
    root = Path(root).resolve()
    if not root.is_dir() or any(root.iterdir()):
        raise BudgetDenied('FAILED_PRECONDITION')
    home, workspace = root / 'home', root / 'workspace'
    home.mkdir(mode=0o700)
    workspace.mkdir(mode=0o700)
    hermes_home = home / '.hermes'
    hermes_home.mkdir(mode=0o700)
    (hermes_home / 'config.yaml').write_text(json.dumps(CONFIG), encoding='utf-8')
    # No whole-profile copying, inherited credentials, PATH tools or project config.
    os.environ.clear()
    os.environ.update(HOME=str(home), HERMES_HOME=str(hermes_home),
                      HERMES_SAFE_MODE='1', HERMES_ENABLE_PROJECT_PLUGINS='0',
                      HERMES_SINGLE_QUERY_SESSION='1', PYTHONDONTWRITEBYTECODE='1',
                      PATH='/usr/bin:/bin', LANG='C.UTF-8')
    os.chdir(workspace)
    denied = []

    def audit(event, args):
        if (event.startswith('socket.') and event not in {'socket.__new__'}
                or event in {'subprocess.Popen', 'os.system', 'os.exec', 'os.posix_spawn'}):
            denied.append(event)  # no arguments: they may contain credentials
            raise PermissionError('offline child denies external OS operation')
        if event == 'open' and isinstance(args[0], (str, bytes)):
            path = Path(os.fsdecode(args[0]))
            if path.name in {'.env', 'auth.json', 'credentials.json'}:
                denied.append('credential_or_dotenv_read')
                raise BudgetDenied('PERMISSION_DENIED')
    global _OFFLINE_READY
    sys.addaudithook(audit)
    _OFFLINE_READY = True
    return workspace, denied


def bind_native(client, ledger, workspace, *, deadline):
    """Construct the REAL pinned AIAgent, retaining native policy + dispatch.

    The provided SDK client is adapter-owned, has no SDK retries and never gets
    exposed to AIAgent. A single guarded facade owns every main-loop request.
    Dedicated child lifetime owns registry registration; no shared host mutation.
    """
    global _BINDING_USED
    if not _OFFLINE_READY or _BINDING_USED or os.environ.get('HERMES_SAFE_MODE') != '1':
        raise BudgetDenied('FAILED_PRECONDITION')
    _BINDING_USED = True
    if str(client.base_url).rstrip('/') != ENDPOINT:
        raise BudgetDenied('PERMISSION_DENIED')
    guard = GuardedResponses(client, ledger, deadline=deadline)
    try:
        from run_agent import AIAgent
        from tools.registry import registry
    except BaseException:
        guard.close()
        raise

    fixture_calls = []

    def fixture(args, **kwargs):
        if args != {} or type(args) is not dict:
            raise BudgetDenied('INVALID_ARGUMENT')
        fixture_calls.append(TOOL)
        return json.dumps(FIXTURE)

    registry.register(name=TOOL, toolset='phase3_fixture', schema=SCHEMA,
                      handler=fixture, description=SCHEMA['description'])

    class RequestAgent(AIAgent):
        def _dump_api_request_debug(self, api_kwargs, *, reason, error=None):
            # No request/error serialization in this credential-bearing boundary.
            # Do not depend on pattern redaction to recognize arbitrary secrets.
            return None

        def _create_openai_client(self, client_kwargs, *, reason, shared):
            # Constructor and rebuilds can obtain only this poisoned-on-failure facade.
            if (client_kwargs.get('base_url', '').rstrip('/') != ENDPOINT
                    or self.model != MODEL or self.provider != 'openai-codex'):
                raise BudgetDenied('PERMISSION_DENIED')
            return guard

        def _ensure_primary_openai_client(self, *, reason):
            return guard

        def _create_request_openai_client(self, *, reason, api_kwargs=None):
            return guard

        def _close_request_openai_client(self, client, *, reason):
            if client is not guard:
                raise BudgetDenied('PERMISSION_DENIED')
            # Request stream owns its close. SDK lifetime is the whole finite task.

        def _try_refresh_codex_client_credentials(self, *, force=True):
            return False

        def _try_refresh_env_client_credentials(self):
            return False

        def _recover_with_credential_pool(self, *, status_code, has_retried_429,
                                          classified_reason=None, error_context=None,
                                          billing_unverified=False):
            # Pinned native no-pool contract: do not refresh, rotate or retry.
            return False, has_retried_429

        def _execute_tool_calls(self, assistant_message, messages, effective_task_id,
                                api_call_count=0):
            # Runs before native INLINE_TOOL_EXECUTORS as well as registry dispatch.
            # Reject the entire batch before any side effect, including mixed batches.
            for call in assistant_message.tool_calls or []:
                if call.function.name != TOOL:
                    raise BudgetDenied('PERMISSION_DENIED')
                try:
                    args = json.loads(call.function.arguments)
                except (TypeError, ValueError):
                    raise BudgetDenied('INVALID_ARGUMENT') from None
                if type(args) is not dict or args:
                    raise BudgetDenied('INVALID_ARGUMENT')
            return super()._execute_tool_calls(assistant_message, messages,
                                               effective_task_id, api_call_count)

    try:
        agent = RequestAgent(
            base_url=ENDPOINT, api_key='offline-binding-placeholder',
            provider='openai-codex', api_mode='codex_responses', model=MODEL,
            max_iterations=3, enabled_toolsets=['phase3_fixture'],
            quiet_mode=True, save_trajectories=False, skip_context_files=True,
            skip_memory=True, skip_background_review=True, load_soul_identity=False,
            fallback_model=None, credential_pool=None, checkpoints_enabled=False,
            run_budget_seconds=max(0.001, deadline-time.monotonic()),
            cwd=str(workspace), session_db=None)
        if (agent.valid_tool_names != {TOOL} or agent._environment_probe
                or agent._api_max_retries != 1 or agent._auto_recovery_cycles != 0):
            # Safe constructor controls only: never include config, paths or auth.
            print('OFFLINE constructor precondition:', json.dumps({
                'tool_names': sorted(agent.valid_tool_names),
                'environment_probe': agent._environment_probe,
                'api_max_retries': agent._api_max_retries,
                'auto_recovery_cycles': agent._auto_recovery_cycles}), file=sys.stderr)
            raise BudgetDenied('FAILED_PRECONDITION')
        return agent, guard, fixture_calls
    except BaseException:
        guard.close()
        raise
