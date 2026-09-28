"""Provider-neutral, restricted canonical graph exchange. Not backup or record promotion."""
from dataclasses import dataclass
import hashlib
import json
import re
from typing import Protocol
from app.domain import AuthContext
from app.schemas import Entity, Record, Relation, Artifact, Finding, AuditEvent, RetrievalEvent, ScopePath
from app.settings import Permission

MODELS = {'entities': Entity, 'records': Record, 'relations': Relation, 'artifacts': Artifact,
          'findings': Finding, 'audit_events': AuditEvent, 'retrieval_events': RetrievalEvent}
EXCLUDED = ['artifact-bytes', 'credentials-and-grants', 'fts', 'provider-layout',
            'same-domain-replay-ledger', 'import-admission-bookkeeping']
MAX_BYTES = 64 * 1024 * 1024
RESERVED_AUDIT = 'memory.canonical.import'

class ExchangeError(ValueError):
    pass

class GraphPort(Protocol):
    def snapshot_graph(self) -> dict: ...
    def import_empty_graph(self, sections: dict, *, actor: str, root: str, digest: str) -> None: ...

@dataclass(frozen=True)
class ExchangeAuthority:
    """Trusted operator context, never populated from the exchange document or ACAP body."""
    auth: AuthContext
    allow_export: bool = False
    allow_import: bool = False
    allow_canonical: bool = False

def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode('utf8')

def _authorized(authority, importing=False):
    if not isinstance(authority, ExchangeAuthority) or not (authority.allow_import if importing else authority.allow_export):
        raise PermissionError('explicit restricted exchange authority required')
    if not authority.auth.has(Permission.admin):
        raise PermissionError('operator memory.admin required; not normal create authority')

def _scope(authority, value):
    if not ScopePath.is_descendant_or_equal(value, authority.auth.scope_path):
        raise PermissionError('exchange object outside operator root')

def validate_sections(sections, authority, importing=False):
    if not isinstance(sections, dict) or set(sections) != set(MODELS):
        raise ExchangeError('unsupported/missing graph sections')
    indexes = {}
    for name, cls in MODELS.items():
        values = sections[name]
        if not isinstance(values, list) or len(values) > 100000:
            raise ExchangeError('section limit/type')
        index = {}
        for value in values:
            try:
                model = cls.model_validate(value)
                normalized = model.model_dump(mode='json', by_alias=True)
            except Exception as e:
                raise ExchangeError('invalid canonical model') from e
            if encoded(normalized) != encoded(value):
                raise ExchangeError('unknown/missing/noncanonical fields')
            _scope(authority, model.scope_path)
            if isinstance(model.id,str) and (not model.id or model.id!=model.id.strip() or len(model.id)>200):
                raise ExchangeError('invalid identity')
            if name=='records' and re.fullmatch(r'rec_[0-9a-f]{32}',model.id) is None:
                raise ExchangeError('record identity must preserve rec_UUID convention')
            key = (model.entity_type, model.id) if name == 'entities' else model.id
            if key in index:
                raise ExchangeError('duplicate ID')
            index[key] = model
            if name == 'records' and importing and model.role.value == 'canonical' and not authority.allow_canonical:
                raise PermissionError('explicit canonical-role preservation authority required')
            if name == 'audit_events' and model.action == RESERVED_AUDIT:
                raise ExchangeError('reserved import bookkeeping is retained, not portable')
        indexes[name] = index
    def ref(kind, oid, scope, entity_type=None):
        group = {'entity': 'entities','record':'records','artifact':'artifacts'}.get(str(kind))
        key = (entity_type, oid) if group == 'entities' else oid
        target = indexes.get(group, {}).get(key)
        if target is None or not ScopePath.is_descendant_or_equal(scope, target.scope_path):
            raise ExchangeError('dangling or invisible reference')
    for obj in indexes['records'].values():
        if obj.entity: ref('entity', obj.entity.id, obj.scope_path, obj.entity.entity_type)
        for field, back in [('supersedes','superseded_by'),('superseded_by','supersedes')]:
            other = getattr(obj, field)
            if other:
                ref('record', other, obj.scope_path)
                if other == obj.id or getattr(indexes['records'][other], back) != obj.id:
                    raise ExchangeError('inconsistent supersession')
        seen = set(); cursor = obj
        while cursor.supersedes:
            if cursor.id in seen: raise ExchangeError('supersession cycle')
            seen.add(cursor.id); cursor = indexes['records'][cursor.supersedes]
    for obj in indexes['relations'].values():
        for endpoint in [obj.from_ref, obj.to_ref]:
            ref(endpoint.kind, endpoint.id, obj.scope_path, endpoint.entity_type)
    for obj in indexes['artifacts'].values():
        if obj.record_id: ref('record', obj.record_id, obj.scope_path)
        if obj.entity: ref('entity', obj.entity.id, obj.scope_path, obj.entity.entity_type)
    for obj in indexes['findings'].values():
        ref(obj.subject.kind, obj.subject.id, obj.scope_path, obj.subject.entity_type)
    # Existing schemas validate roles/lifecycle/policy. IDs are preserved, never remapped.
    return sections

def export_graph(store: GraphPort, authority: ExchangeAuthority) -> bytes:
    _authorized(authority)
    sections = store.snapshot_graph()
    validate_sections(sections, authority)
    sections = {name: sorted(values, key=encoded) for name, values in sections.items()}
    body = {'format':'alica.memory.canonical','formatVersion':1,'modelVersion':1,
            'sections':sections,'excluded':EXCLUDED}
    result = encoded({**body,'integrity':{'algorithm':'sha256','digest':hashlib.sha256(encoded(body)).hexdigest()}})
    if len(result)>MAX_BYTES: raise ExchangeError('export size limit')
    return result

def _pairs(items):
    result = {}
    for key, value in items:
        if key in result: raise ExchangeError('duplicate JSON key')
        result[key] = value
    return result

def decode_graph(raw, authority):
    if not isinstance(raw, bytes) or len(raw)>MAX_BYTES: raise ExchangeError('input size/type')
    try:
        body = json.loads(raw, object_pairs_hook=_pairs, parse_constant=lambda v: (_ for _ in ()).throw(ExchangeError('nonfinite JSON')))
    except (ValueError, UnicodeError) as e: raise ExchangeError('invalid JSON') from e
    if not isinstance(body,dict) or set(body)!={'format','formatVersion','modelVersion','sections','excluded','integrity'}:
        raise ExchangeError('unsupported envelope')
    if body['format']!='alica.memory.canonical' or type(body['formatVersion']) is not int or body['formatVersion']!=1 or type(body['modelVersion']) is not int or body['modelVersion']!=1 or body['excluded']!=EXCLUDED:
        raise ExchangeError('unsupported format/model/classification')
    integrity = body.pop('integrity')
    expected = {'algorithm':'sha256','digest':hashlib.sha256(encoded(body)).hexdigest()}
    if integrity != expected: raise ExchangeError('integrity mismatch; checksum is not authenticity')
    validate_sections(body['sections'], authority, importing=True)
    return body['sections'], expected['digest']

def import_graph(store: GraphPort, raw: bytes, authority: ExchangeAuthority):
    _authorized(authority, importing=True)
    sections, digest = decode_graph(raw, authority)  # all prevalidation before any target mutation
    store.import_empty_graph(sections, actor=authority.auth.actor, root=authority.auth.scope_path, digest=digest)
    return {'digest':digest,'counts':{name:len(rows) for name,rows in sections.items()},'newDomain':True,'replayLedgerImported':False}
