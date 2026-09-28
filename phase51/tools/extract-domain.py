"""One-time acceptance-linked extraction from the pinned copied source, not production."""
import ast
import copy
import pathlib

root = pathlib.Path(__file__).resolve().parents[2]
app = root / 'services/memoryv4/app'
assert not (app / 'domain.py').exists(), 'one-time extraction only'
source = ast.parse((app / 'main.py').read_text())
storage = ast.parse((app / 'storage.py').read_text())
factory = next(n for n in source.body if isinstance(n, ast.FunctionDef) and n.name == 'create_app')
helpers = [copy.deepcopy(n) for n in source.body if isinstance(n, (ast.FunctionDef, ast.ClassDef)) and n is not factory]
exceptions = ast.parse('\n'.join('class ' + n + '(Exception):\n    pass\n' for n in ['IdempotencyConflictError', 'VersionConflictError', 'RecordStateConflictError', 'ObjectConflictError'])).body
backend = next(n for n in storage.body if isinstance(n, ast.ClassDef) and n.name == 'SqliteStore')
port_methods = []
for n in backend.body:
    if isinstance(n, ast.FunctionDef) and not n.name.startswith('_') and n.name not in {'write_audit', 'write_retrieval'}:
        item = copy.deepcopy(n)
        item.body = [ast.Expr(ast.Constant(Ellipsis))]
        item.decorator_list = []
        port_methods.append(item)
port_import = next(copy.deepcopy(n) for n in storage.body if isinstance(n, ast.ImportFrom) and n.module == 'app.schemas')
ports = ast.parse('from __future__ import annotations\nfrom typing import Protocol\n')
ports.body += [port_import] + exceptions + [ast.ClassDef(name='Store', bases=[ast.Name(id='Protocol', ctx=ast.Load())], keywords=[], body=port_methods, decorator_list=[])]
(app / 'ports.py').write_text(ast.unparse(ast.fix_missing_locations(ports)) + '\n')
imports = [copy.deepcopy(n) for n in source.body if isinstance(n, ast.ImportFrom) and n.module in {'app.contracts', 'app.schemas', 'app.pagination'}]
domain = ast.parse('''from __future__ import annotations
import hashlib
import json
from datetime import datetime, timezone
from dataclasses import dataclass
from app.settings import ApiKeyGrant
from app.ports import Store, IdempotencyConflictError, ObjectConflictError, RecordStateConflictError, VersionConflictError

class DomainError(Exception):
    def __init__(self, status_code, detail):
        super().__init__(detail['message'])
        self.status_code = status_code
        self.detail = detail
        self.audited = False

@dataclass(frozen=True)
class MutationResult:
    value: object
    replayed: bool

@dataclass(frozen=True)
class AuditContext:
    request_id: str = 'native-domain'
    operation: str = 'domain.mutation'

class GovernedMemory:
    def __init__(self, store: Store):
        self.store = store
''')
domain.body[1:1] = imports
klass = domain.body[-1]
for h in helpers:
    if isinstance(h, ast.FunctionDef) and h.name == '_api_error':
        h.returns = ast.Name(id='DomainError', ctx=ast.Load())
        h.body[0].value.func = ast.Name(id='DomainError', ctx=ast.Load())
domain.body[-1:-1] = helpers
names = []
for route in factory.body:
    if not isinstance(route, ast.FunctionDef) or not any(isinstance(d, ast.Call) and isinstance(d.func, ast.Attribute) and isinstance(d.func.value, ast.Name) and d.func.value.id == 'app' and d.func.attr in {'get','post','patch'} for d in route.decorator_list):
        continue
    if route.name in {'health','get_capabilities','get_schema'}:
        continue
    names.append(route.name)
    method = copy.deepcopy(route)
    mutation = any(a.arg == 'response' for a in route.args.args)
    defaults = [None] * (len(route.args.args)-len(route.args.defaults)) + route.args.defaults
    args, defs = [], []
    for arg, default in zip(method.args.args, defaults):
        if arg.arg in {'store','response'}:
            continue
        args.append(arg)
        if isinstance(default, ast.Call):
            if isinstance(default.func, ast.Name) and default.func.id == 'Depends':
                default = None
            else:
                default = default.args[0] if default.args else next((k.value for k in default.keywords if k.arg == 'default'), None)
        defs.append(default)
    args.append(ast.arg(arg='audit_context', annotation=ast.Name(id='AuditContext', ctx=ast.Load())))
    defs.append(ast.Call(func=ast.Name(id='AuditContext', ctx=ast.Load()), args=[], keywords=[]))
    method.args = ast.arguments(posonlyargs=[],args=[ast.arg(arg='self')],vararg=None,kwonlyargs=args,kw_defaults=defs,kwarg=None,defaults=[])
    method.decorator_list = []
    if mutation:
        method.body = [n for n in method.body if not (isinstance(n, ast.Assign) and any(isinstance(t,ast.Subscript) and ast.unparse(t).startswith('response.headers') for t in n.targets))]
        for n in method.body:
            if isinstance(n,ast.Return):
                n.value = ast.Call(func=ast.Name(id='MutationResult',ctx=ast.Load()),args=[n.value,ast.Name(id='replayed',ctx=ast.Load())],keywords=[])
        method.returns=ast.Name(id='MutationResult',ctx=ast.Load())
        handler = ast.parse('''try:
    pass
except DomainError as exc:
    try:
        store.write_denial(operation=audit_context.operation, actor=auth.actor, scope_path=auth.scope_path, request_id=audit_context.request_id, status_code=exc.status_code, reason=reason[:500] if reason else None)
        exc.audited = True
    except Exception:
        pass
    raise
''').body[0]
        handler.body = method.body
        method.body = [handler]
        if not any(a.arg=='reason' for a in args):
            method.body.insert(0,ast.parse('reason = None').body[0])
    method.body.insert(0,ast.parse('store = self.store').body[0])
    klass.body.append(method)
    # Thin HTTP adapter preserves exact route decorators/signature/defaults and result schema.
    route.args.args.insert(0,ast.arg(arg='request',annotation=ast.Name(id='Request',ctx=ast.Load())))
    passed = ', '.join(a.arg+'='+a.arg for a in route.args.args if a.arg not in {'request','response','store'})
    call = f'GovernedMemory(store).{route.name}({passed}, audit_context=AuditContext(request.state.request_id, request.method + " " + request.url.path))'
    body = f'result = {call}\n'
    if mutation:
        body += 'response.headers["Idempotency-Replayed"] = str(result.replayed).lower()\nreturn result.value'
    else:
        body += 'return result'
    route.body = ast.parse(body).body
# Remove duplicated business governance helpers; HTTP auth still uses _api_error.
source.body = [n for n in source.body if not (isinstance(n,(ast.FunctionDef,ast.ClassDef)) and n is not factory and n.name != '_api_error')]
source.body[2:2] = ast.parse('from app.domain import AuthContext, GovernedMemory, DomainError, AuditContext, _require_permission\n').body
# Register domain-error mapping without altering original HTTP validation/error semantics.
handler=next(n for n in factory.body if isinstance(n,ast.AsyncFunctionDef) and n.name=='http_error')
handler.decorator_list.append(ast.parse('app.exception_handler(DomainError)',mode='eval').body)
handler.body.insert(0,ast.parse('request.state.domain_denial_recorded = getattr(exc, "audited", False)').body[0])
middleware=next(n for n in factory.body if isinstance(n,ast.AsyncFunctionDef) and n.name=='governance_envelope')
for n in middleware.body:
    if isinstance(n,ast.If):
        n.test=ast.BoolOp(op=ast.And(),values=[n.test,ast.parse('not getattr(request.state,"domain_denial_recorded",False)',mode='eval').body])
(app / 'domain.py').write_text(ast.unparse(ast.fix_missing_locations(domain)) + '\n')
(app / 'main.py').write_text(ast.unparse(ast.fix_missing_locations(source)) + '\n')
print('Extracted governed domain methods:', ', '.join(names))
print('Complete Store port methods:', len(port_methods))
