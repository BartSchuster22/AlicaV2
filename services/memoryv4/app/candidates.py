"""Private ACAP value mapping. Governance is exclusively in GovernedMemory."""
from typing import Annotated
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from app.contracts import Permission
from app.domain import AuthContext, AuditContext, DomainError, GovernedMemory
from app.schemas import RecordCreate, Role, Lifecycle
from app.settings import _parse_grant

class AdapterError(Exception):
    pass

class Closed(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)

Scope = Annotated[str, Field(min_length=1, max_length=1000)]
Ref = Annotated[str, Field(min_length=1, max_length=512)]

class Provenance(Closed):
    source: Annotated[str, Field(min_length=1, max_length=240)]

class Create(Closed):
    scope: Scope
    title: Annotated[str, Field(min_length=1, max_length=240)]
    content: Annotated[str, Field(min_length=1, max_length=8192)]
    sourceRefs: Annotated[list[Ref], Field(max_length=8)]
    provenance: Provenance

    @field_validator('sourceRefs')
    @classmethod
    def refs(cls, value):
        if any(x != x.strip() or any(ord(c) < 32 or ord(c) == 127 for c in x) for x in value):
            raise ValueError('invalid source reference')
        return value

class Get(Closed):
    scope: Scope
    id: Annotated[str, Field(min_length=1, max_length=200)]

class Search(Closed):
    scope: Scope
    query: Annotated[str, Field(min_length=1, max_length=500)]
    limit: Annotated[int, Field(ge=1, le=25)]
    cursor: Annotated[str, Field(max_length=4096)]

class Candidate(Create):
    id: Annotated[str, Field(min_length=1, max_length=200)]
    author: Annotated[str, Field(min_length=1, max_length=200)]
    version: Annotated[int, Field(ge=1, le=2147483647)]
    role: str
    lifecycle: str

def project(record):
    if record.role != Role.active or record.lifecycle != Lifecycle.working:
        raise AdapterError('NOT_FOUND')
    if not isinstance(record.provenance.get('source'), str) or not record.provenance['source']:
        raise AdapterError('FAILED_PRECONDITION')
    try:
        return Candidate(scope=record.scope_path, id=record.id, title=record.title,
                         content=record.content, sourceRefs=record.source_refs,
                         provenance={'source': record.provenance['source']},
                         author=record.author_actor, version=record.version,
                         role='active', lifecycle='working').model_dump()
    except ValidationError as exc:
        raise AdapterError('RESOURCE_EXHAUSTED') from exc

def invoke(service: GovernedMemory, operation, payload, authority, key, request_id):
    # This authority travels on the provider-owned private pipe, never the public payload.
    try:
        grant = _parse_grant('private-context', authority)
    except (TypeError, ValueError) as exc:
        raise AdapterError('UNAUTHENTICATED') from exc
    allowed = {Permission.create_working, Permission.read, Permission.search}
    if not grant.permissions <= allowed or grant.allow_actor_delegation:
        raise AdapterError('PERMISSION_DENIED')
    auth = AuthContext(grant)
    try:
        if operation == 'create':
            data = Create.model_validate(payload)
            record = RecordCreate(title=data.title, content=data.content,
                scope_path=data.scope, role='active', lifecycle='working',
                write_policy='author_only', source_refs=data.sourceRefs,
                provenance=data.provenance.model_dump())
            result = service.create_record(record=record, auth=auth, idempotency_key=key,
                                          audit_context=AuditContext(request_id, 'acap.candidates.create'))
            return project(result.value)
        if operation == 'get':
            data = Get.model_validate(payload)
            return project(service.get_record(record_id=data.id, auth=auth, scope_path=data.scope))
        if operation == 'search':
            data = Search.model_validate(payload)
            page = service.search(auth=auth, q=data.query, scope_path=data.scope,
                                  role=Role.active, lifecycle=Lifecycle.working,
                                  limit=data.limit, cursor=data.cursor or None)
            # Never silently omit a hit that is outside projection bounds.
            return {'candidates': [project(item.record) for item in page.results],
                    'nextCursor': page.next_cursor or ''}
        raise AdapterError('INVALID_ARGUMENT')
    except ValidationError as exc:
        raise AdapterError('INVALID_ARGUMENT') from exc
    except DomainError as exc:
        raise AdapterError({401:'UNAUTHENTICATED',403:'PERMISSION_DENIED',404:'NOT_FOUND',
                            409:'CONFLICT',412:'FAILED_PRECONDITION',428:'FAILED_PRECONDITION',
                            422:'INVALID_ARGUMENT'}.get(exc.status_code,'UNAVAILABLE')) from exc
    except ValueError as exc:
        raise AdapterError('INVALID_ARGUMENT') from exc
