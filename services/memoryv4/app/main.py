"""FastAPI entrypoint for the MemoryV4 governed core service."""
from __future__ import annotations
from app.domain import AuthContext, GovernedMemory, DomainError, AuditContext, _require_permission
import hashlib
import json
import sqlite3
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from hmac import compare_digest
from uuid import uuid4
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from app.contracts import CONTRACT_VERSION, CapabilitiesResponse, ErrorBody, ErrorResponse, Permission, SchemaContractResponse, WritePolicy, capabilities, schema_contract
from app.pagination import CursorError
from app.schemas import Artifact, ArtifactCreate, ArtifactPage, AuditEventPage, Entity, EntityContext, EntityCreate, EntityPage, EntityPatch, Finding, FindingPage, FindingResolutionRequest, FindingStatus, FindingType, Lifecycle, ObjectKind, Record, RecordCreate, RecordPage, RecordPatch, RecordSupersedeRequest, RecordTransitionRequest, Relation, RelationCreate, RelationPage, RetrievalEventPage, Role, ScopePath, SearchPage, SortOrder, UsageResponse
from app.settings import ApiKeyGrant, load_settings
from app.storage import IdempotencyConflictError, ObjectConflictError, RecordStateConflictError, SqliteStore, VersionConflictError, probe_sqlite
APP_NAME = 'memoryv4-core'
APP_VERSION = '0.7.0-production-qa'

def _api_error(status_code: int, code: str, message: str, **details: object) -> HTTPException:
    return HTTPException(status_code=status_code, detail={'code': code, 'message': message, 'details': details})

def create_app() -> FastAPI:
    """Create and configure the MemoryV4 core FastAPI application."""
    settings = load_settings()
    store: SqliteStore | None = None

    def initialize_store() -> SqliteStore:
        nonlocal store
        if store is None:
            store = SqliteStore(settings.database_path, busy_timeout_ms=settings.sqlite_busy_timeout_ms, integrity_check=settings.startup_integrity_check)
        return store

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        active_store = initialize_store()
        try:
            yield
        finally:
            active_store.close()
    app = FastAPI(title='MemoryV4 Core', version=settings.version, description='Slim governed memory core. UI and orchestration are out of scope.', lifespan=lifespan)

    def get_store() -> SqliteStore:
        return initialize_store()

    @app.middleware('http')
    async def governance_envelope(request: Request, call_next):
        request.state.request_id = request.headers.get('X-Request-ID') or f'req_{uuid4().hex}'
        request.state.actor = 'anonymous'
        request.state.scope_path = '_unknown'
        response = await call_next(request)
        if (request.method in {'POST', 'PATCH', 'PUT', 'DELETE'} and response.status_code >= 400) and (not getattr(request.state, 'domain_denial_recorded', False)):
            reason = request.headers.get('X-MemoryV4-Reason')
            try:
                get_store().write_denial(operation=f'{request.method} {request.url.path}', actor=request.state.actor, scope_path=request.state.scope_path, request_id=request.state.request_id, status_code=response.status_code, reason=reason[:500] if reason else None)
            except sqlite3.DatabaseError:
                pass
        response.headers['X-Request-ID'] = request.state.request_id
        response.headers['X-MemoryV4-Contract-Version'] = CONTRACT_VERSION
        return response

    @app.exception_handler(HTTPException)
    @app.exception_handler(DomainError)
    async def http_error(request: Request, exc: HTTPException) -> JSONResponse:
        request.state.domain_denial_recorded = getattr(exc, 'audited', False)
        code_by_status = {401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 409: 'conflict', 412: 'version_conflict', 428: 'precondition_required'}
        if isinstance(exc.detail, dict):
            default_code = code_by_status.get(exc.status_code, 'request_failed')
            code = str(exc.detail.get('code', default_code))
            message = str(exc.detail.get('message', 'request failed'))
            details = exc.detail.get('details', {})
        else:
            code = code_by_status.get(exc.status_code, 'request_failed')
            message = str(exc.detail)
            details = {}
        body = ErrorResponse(error=ErrorBody(code=code, message=message, status=exc.status_code, request_id=request.state.request_id, details=details))
        return JSONResponse(status_code=exc.status_code, content=body.model_dump(mode='json'))

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        violations = [{'type': error['type'], 'location': [str(part) for part in error['loc']], 'message': error['msg']} for error in exc.errors()]
        body = ErrorResponse(error=ErrorBody(code='invalid_request', message='request validation failed', status=status.HTTP_422_UNPROCESSABLE_ENTITY, request_id=request.state.request_id, details={'violations': violations}))
        return JSONResponse(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, content=body.model_dump(mode='json'))

    @app.exception_handler(sqlite3.DatabaseError)
    async def storage_error(request: Request, exc: sqlite3.DatabaseError) -> JSONResponse:
        body = ErrorResponse(error=ErrorBody(code='storage_unavailable', message='persistent storage is unavailable', status=status.HTTP_503_SERVICE_UNAVAILABLE, request_id=request.state.request_id, details={}))
        return JSONResponse(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, content=body.model_dump(mode='json'))

    def require_auth(request: Request, authorization: str | None=Header(default=None), delegated_actor: str | None=Header(default=None, alias='X-MemoryV4-Actor')) -> AuthContext:
        if not authorization or not authorization.startswith('Bearer '):
            raise _api_error(401, 'unauthorized', 'bearer token required')
        token = authorization.removeprefix('Bearer ')
        for (candidate, grant) in settings.api_keys.items():
            if compare_digest(token, candidate):
                if grant.allow_actor_delegation:
                    if delegated_actor is None or delegated_actor != delegated_actor.strip() or (not 1 <= len(delegated_actor) <= 200) or any((ord(char) < 32 for char in delegated_actor)):
                        raise _api_error(422, 'invalid_request', 'X-MemoryV4-Actor is required for this delegated grant')
                elif delegated_actor is not None:
                    raise _api_error(403, 'forbidden', 'this grant cannot delegate actor identity')
                auth = AuthContext(grant, delegated_actor=delegated_actor)
                request.state.actor = auth.actor
                request.state.scope_path = auth.scope_path
                return auth
        raise _api_error(401, 'unauthorized', 'invalid bearer token')

    @app.get('/health', tags=['health'])
    def health() -> dict[str, str]:
        initialize_store()
        storage = probe_sqlite(settings.database_path, busy_timeout_ms=settings.sqlite_busy_timeout_ms)
        return {'status': 'ok' if storage['status'] == 'ok' else 'degraded', 'service': settings.service_name, 'version': settings.version, 'storage_backend': storage['backend']}

    @app.get('/capabilities', response_model=CapabilitiesResponse, tags=['contract'], responses={401: {'model': ErrorResponse}, 403: {'model': ErrorResponse}})
    def get_capabilities(auth: AuthContext=Depends(require_auth)) -> CapabilitiesResponse:
        _require_permission(auth, Permission.read)
        return capabilities(settings.service_name)

    @app.get('/schema', response_model=SchemaContractResponse, tags=['contract'], responses={401: {'model': ErrorResponse}, 403: {'model': ErrorResponse}})
    def get_schema(auth: AuthContext=Depends(require_auth)) -> SchemaContractResponse:
        _require_permission(auth, Permission.read)
        return schema_contract()

    @app.post('/entities', status_code=status.HTTP_201_CREATED, tags=['entities'])
    def create_entity(request: Request, entity: EntityCreate, response: Response, auth: AuthContext=Depends(require_auth), store: SqliteStore=Depends(get_store), idempotency_key: str | None=Header(default=None, alias='Idempotency-Key')) -> Entity:
        result = GovernedMemory(store).create_entity(entity=entity, auth=auth, idempotency_key=idempotency_key, audit_context=AuditContext(request.state.request_id, request.method + ' ' + request.url.path))
        response.headers['Idempotency-Replayed'] = str(result.replayed).lower()
        return result.value

    @app.get('/entities', response_model=EntityPage, tags=['entities'])
    def list_entities(request: Request, auth: AuthContext=Depends(require_auth), store: SqliteStore=Depends(get_store), scope_path: str | None=Query(None), include_public: bool=Query(False), entity_type: str | None=Query(None), name_contains: str | None=Query(None, min_length=1, max_length=240), sort: str=Query('updated_at', pattern='^(name|created_at|updated_at|id)$'), order: SortOrder=Query(SortOrder.desc), limit: int=Query(50, ge=1, le=100), cursor: str | None=Query(None)) -> EntityPage:
        result = GovernedMemory(store).list_entities(auth=auth, scope_path=scope_path, include_public=include_public, entity_type=entity_type, name_contains=name_contains, sort=sort, order=order, limit=limit, cursor=cursor, audit_context=AuditContext(request.state.request_id, request.method + ' ' + request.url.path))
        return result

    @app.get('/entities/{entity_type}/{entity_id}', tags=['entities'])
    def get_entity(request: Request, entity_type: str, entity_id: str, auth: AuthContext=Depends(require_auth), store: SqliteStore=Depends(get_store), scope_path: str | None=Query(None), include_public: bool=Query(False)) -> Entity:
        result = GovernedMemory(store).get_entity(entity_type=entity_type, entity_id=entity_id, auth=auth, scope_path=scope_path, include_public=include_public, audit_context=AuditContext(request.state.request_id, request.method + ' ' + request.url.path))
        return result

    @app.patch('/entities/{entity_type}/{entity_id}', tags=['entities'])
    def patch_entity(request: Request, entity_type: str, entity_id: str, patch: EntityPatch, response: Response, auth: AuthContext=Depends(require_auth), store: SqliteStore=Depends(get_store), idempotency_key: str | None=Header(default=None, alias='Idempotency-Key'), if_match: str | None=Header(default=None, alias='If-Match')) -> Entity:
        result = GovernedMemory(store).patch_entity(entity_type=entity_type, entity_id=entity_id, patch=patch, auth=auth, idempotency_key=idempotency_key, if_match=if_match, audit_context=AuditContext(request.state.request_id, request.method + ' ' + request.url.path))
        response.headers['Idempotency-Replayed'] = str(result.replayed).lower()
        return result.value

    @app.post('/records', status_code=status.HTTP_201_CREATED, tags=['records'])
    def create_record(request: Request, record: RecordCreate, response: Response, auth: AuthContext=Depends(require_auth), store: SqliteStore=Depends(get_store), idempotency_key: str | None=Header(default=None, alias='Idempotency-Key')) -> Record:
        result = GovernedMemory(store).create_record(record=record, auth=auth, idempotency_key=idempotency_key, audit_context=AuditContext(request.state.request_id, request.method + ' ' + request.url.path))
        response.headers['Idempotency-Replayed'] = str(result.replayed).lower()
        return result.value

    @app.get('/records', response_model=RecordPage, tags=['records'])
    def list_records(request: Request, auth: AuthContext=Depends(require_auth), store: SqliteStore=Depends(get_store), scope_path: str | None=Query(None), include_public: bool=Query(False), role: Role | None=Query(None), lifecycle: Lifecycle | None=Query(None), entity_type: str | None=Query(None), entity_id: str | None=Query(None), topic: str | None=Query(None), tag: str | None=Query(None), min_confidence: float | None=Query(None, ge=0, le=1), include_deleted: bool=Query(False), sort: str=Query('updated_at', pattern='^(title|created_at|updated_at|confidence|id)$'), order: SortOrder=Query(SortOrder.desc), limit: int=Query(50, ge=1, le=100), cursor: str | None=Query(None)) -> RecordPage:
        result = GovernedMemory(store).list_records(auth=auth, scope_path=scope_path, include_public=include_public, role=role, lifecycle=lifecycle, entity_type=entity_type, entity_id=entity_id, topic=topic, tag=tag, min_confidence=min_confidence, include_deleted=include_deleted, sort=sort, order=order, limit=limit, cursor=cursor, audit_context=AuditContext(request.state.request_id, request.method + ' ' + request.url.path))
        return result

    @app.get('/records/{record_id}', tags=['records'])
    def get_record(request: Request, record_id: str, auth: AuthContext=Depends(require_auth), store: SqliteStore=Depends(get_store), scope_path: str | None=Query(None), include_public: bool=Query(False)) -> Record:
        result = GovernedMemory(store).get_record(record_id=record_id, auth=auth, scope_path=scope_path, include_public=include_public, audit_context=AuditContext(request.state.request_id, request.method + ' ' + request.url.path))
        return result

    @app.patch('/records/{record_id}', tags=['records'])
    def patch_record(request: Request, record_id: str, patch: RecordPatch, response: Response, auth: AuthContext=Depends(require_auth), store: SqliteStore=Depends(get_store), idempotency_key: str | None=Header(default=None, alias='Idempotency-Key'), if_match: str | None=Header(default=None, alias='If-Match')) -> Record:
        result = GovernedMemory(store).patch_record(record_id=record_id, patch=patch, auth=auth, idempotency_key=idempotency_key, if_match=if_match, audit_context=AuditContext(request.state.request_id, request.method + ' ' + request.url.path))
        response.headers['Idempotency-Replayed'] = str(result.replayed).lower()
        return result.value

    @app.post('/records/{record_id}/supersede', tags=['records'])
    def supersede_record(request: Request, record_id: str, replacement: RecordSupersedeRequest, response: Response, auth: AuthContext=Depends(require_auth), store: SqliteStore=Depends(get_store), idempotency_key: str | None=Header(default=None, alias='Idempotency-Key'), if_match: str | None=Header(default=None, alias='If-Match'), reason: str | None=Header(default=None, alias='X-MemoryV4-Reason')) -> Record:
        result = GovernedMemory(store).supersede_record(record_id=record_id, replacement=replacement, auth=auth, idempotency_key=idempotency_key, if_match=if_match, reason=reason, audit_context=AuditContext(request.state.request_id, request.method + ' ' + request.url.path))
        response.headers['Idempotency-Replayed'] = str(result.replayed).lower()
        return result.value

    @app.post('/records/{record_id}/transition', tags=['records'])
    def transition_record(request: Request, record_id: str, transition: RecordTransitionRequest, response: Response, auth: AuthContext=Depends(require_auth), store: SqliteStore=Depends(get_store), idempotency_key: str | None=Header(default=None, alias='Idempotency-Key'), if_match: str | None=Header(default=None, alias='If-Match'), reason: str | None=Header(default=None, alias='X-MemoryV4-Reason')) -> Record:
        result = GovernedMemory(store).transition_record(record_id=record_id, transition=transition, auth=auth, idempotency_key=idempotency_key, if_match=if_match, reason=reason, audit_context=AuditContext(request.state.request_id, request.method + ' ' + request.url.path))
        response.headers['Idempotency-Replayed'] = str(result.replayed).lower()
        return result.value

    @app.post('/records/{record_id}/promote', tags=['records'])
    def promote_record(request: Request, record_id: str, response: Response, auth: AuthContext=Depends(require_auth), store: SqliteStore=Depends(get_store), idempotency_key: str | None=Header(default=None, alias='Idempotency-Key'), if_match: str | None=Header(default=None, alias='If-Match'), reason: str | None=Header(default=None, alias='X-MemoryV4-Reason')) -> Record:
        result = GovernedMemory(store).promote_record(record_id=record_id, auth=auth, idempotency_key=idempotency_key, if_match=if_match, reason=reason, audit_context=AuditContext(request.state.request_id, request.method + ' ' + request.url.path))
        response.headers['Idempotency-Replayed'] = str(result.replayed).lower()
        return result.value

    @app.post('/relations', status_code=status.HTTP_201_CREATED, tags=['relations'])
    def create_relation(request: Request, relation: RelationCreate, response: Response, auth: AuthContext=Depends(require_auth), store: SqliteStore=Depends(get_store), idempotency_key: str | None=Header(default=None, alias='Idempotency-Key')) -> Relation:
        result = GovernedMemory(store).create_relation(relation=relation, auth=auth, idempotency_key=idempotency_key, audit_context=AuditContext(request.state.request_id, request.method + ' ' + request.url.path))
        response.headers['Idempotency-Replayed'] = str(result.replayed).lower()
        return result.value

    @app.get('/relations', response_model=RelationPage, tags=['relations'])
    def list_relations(request: Request, auth: AuthContext=Depends(require_auth), store: SqliteStore=Depends(get_store), scope_path: str | None=Query(None), include_public: bool=Query(False), relation_type: str | None=Query(None), from_kind: ObjectKind | None=Query(None), from_id: str | None=Query(None), to_kind: ObjectKind | None=Query(None), to_id: str | None=Query(None), limit: int=Query(50, ge=1, le=100), cursor: str | None=Query(None)) -> RelationPage:
        result = GovernedMemory(store).list_relations(auth=auth, scope_path=scope_path, include_public=include_public, relation_type=relation_type, from_kind=from_kind, from_id=from_id, to_kind=to_kind, to_id=to_id, limit=limit, cursor=cursor, audit_context=AuditContext(request.state.request_id, request.method + ' ' + request.url.path))
        return result

    @app.post('/artifacts', status_code=status.HTTP_201_CREATED, tags=['artifacts'])
    def create_artifact(request: Request, artifact: ArtifactCreate, response: Response, auth: AuthContext=Depends(require_auth), store: SqliteStore=Depends(get_store), idempotency_key: str | None=Header(default=None, alias='Idempotency-Key')) -> Artifact:
        result = GovernedMemory(store).create_artifact(artifact=artifact, auth=auth, idempotency_key=idempotency_key, audit_context=AuditContext(request.state.request_id, request.method + ' ' + request.url.path))
        response.headers['Idempotency-Replayed'] = str(result.replayed).lower()
        return result.value

    @app.get('/artifacts', response_model=ArtifactPage, tags=['artifacts'])
    def list_artifacts(request: Request, auth: AuthContext=Depends(require_auth), store: SqliteStore=Depends(get_store), scope_path: str | None=Query(None), include_public: bool=Query(False), artifact_type: str | None=Query(None), record_id: str | None=Query(None), entity_type: str | None=Query(None), entity_id: str | None=Query(None), limit: int=Query(50, ge=1, le=100), cursor: str | None=Query(None)) -> ArtifactPage:
        result = GovernedMemory(store).list_artifacts(auth=auth, scope_path=scope_path, include_public=include_public, artifact_type=artifact_type, record_id=record_id, entity_type=entity_type, entity_id=entity_id, limit=limit, cursor=cursor, audit_context=AuditContext(request.state.request_id, request.method + ' ' + request.url.path))
        return result

    @app.get('/context/{entity_type}/{entity_id}', response_model=EntityContext, tags=['context'])
    def get_context(request: Request, entity_type: str, entity_id: str, auth: AuthContext=Depends(require_auth), store: SqliteStore=Depends(get_store), scope_path: str | None=Query(None), include_public: bool=Query(False), limit: int=Query(50, ge=1, le=100)) -> EntityContext:
        result = GovernedMemory(store).get_context(entity_type=entity_type, entity_id=entity_id, auth=auth, scope_path=scope_path, include_public=include_public, limit=limit, audit_context=AuditContext(request.state.request_id, request.method + ' ' + request.url.path))
        return result

    @app.get('/search', response_model=SearchPage, tags=['retrieval'])
    def search(request: Request, auth: AuthContext=Depends(require_auth), store: SqliteStore=Depends(get_store), q: str=Query(min_length=1, max_length=500), scope_path: str | None=Query(None), include_public: bool=Query(False), role: Role | None=Query(None), lifecycle: Lifecycle | None=Query(None), entity_type: str | None=Query(None), entity_id: str | None=Query(None), tag: str | None=Query(None), limit: int=Query(25, ge=1, le=100), cursor: str | None=Query(None)) -> SearchPage:
        result = GovernedMemory(store).search(auth=auth, q=q, scope_path=scope_path, include_public=include_public, role=role, lifecycle=lifecycle, entity_type=entity_type, entity_id=entity_id, tag=tag, limit=limit, cursor=cursor, audit_context=AuditContext(request.state.request_id, request.method + ' ' + request.url.path))
        return result

    @app.get('/review/findings', response_model=FindingPage, tags=['review'])
    def list_findings(request: Request, auth: AuthContext=Depends(require_auth), store: SqliteStore=Depends(get_store), scope_path: str | None=Query(None), include_public: bool=Query(False), finding_type: FindingType | None=Query(None), finding_status: FindingStatus | None=Query(None, alias='status'), subject_kind: ObjectKind | None=Query(None), subject_id: str | None=Query(None), limit: int=Query(50, ge=1, le=100), cursor: str | None=Query(None)) -> FindingPage:
        result = GovernedMemory(store).list_findings(auth=auth, scope_path=scope_path, include_public=include_public, finding_type=finding_type, finding_status=finding_status, subject_kind=subject_kind, subject_id=subject_id, limit=limit, cursor=cursor, audit_context=AuditContext(request.state.request_id, request.method + ' ' + request.url.path))
        return result

    @app.post('/review/findings/{finding_id}/resolve', tags=['review'])
    def resolve_finding(request: Request, finding_id: str, resolution: FindingResolutionRequest, response: Response, auth: AuthContext=Depends(require_auth), store: SqliteStore=Depends(get_store), idempotency_key: str | None=Header(default=None, alias='Idempotency-Key'), if_match: str | None=Header(default=None, alias='If-Match'), reason: str | None=Header(default=None, alias='X-MemoryV4-Reason')) -> Finding:
        result = GovernedMemory(store).resolve_finding(finding_id=finding_id, resolution=resolution, auth=auth, idempotency_key=idempotency_key, if_match=if_match, reason=reason, audit_context=AuditContext(request.state.request_id, request.method + ' ' + request.url.path))
        response.headers['Idempotency-Replayed'] = str(result.replayed).lower()
        return result.value

    @app.get('/audit/events', response_model=AuditEventPage, tags=['audit'])
    def list_audit_events(request: Request, auth: AuthContext=Depends(require_auth), store: SqliteStore=Depends(get_store), scope_path: str | None=Query(None), include_public: bool=Query(False), action: str | None=Query(None, min_length=1, max_length=200), object_type: str | None=Query(None, min_length=1, max_length=100), object_id: str | None=Query(None, min_length=1, max_length=200), actor: str | None=Query(None, min_length=1, max_length=200), from_time: datetime | None=Query(None), to_time: datetime | None=Query(None), limit: int=Query(50, ge=1, le=100), cursor: str | None=Query(None)) -> AuditEventPage:
        result = GovernedMemory(store).list_audit_events(auth=auth, scope_path=scope_path, include_public=include_public, action=action, object_type=object_type, object_id=object_id, actor=actor, from_time=from_time, to_time=to_time, limit=limit, cursor=cursor, audit_context=AuditContext(request.state.request_id, request.method + ' ' + request.url.path))
        return result

    @app.get('/retrieval-events', response_model=RetrievalEventPage, tags=['audit'])
    def list_retrieval_events(request: Request, auth: AuthContext=Depends(require_auth), store: SqliteStore=Depends(get_store), scope_path: str | None=Query(None), include_public: bool=Query(False), actor: str | None=Query(None, min_length=1, max_length=200), degraded: bool | None=Query(None), query_contains: str | None=Query(None, min_length=1, max_length=500), from_time: datetime | None=Query(None), to_time: datetime | None=Query(None), limit: int=Query(50, ge=1, le=100), cursor: str | None=Query(None)) -> RetrievalEventPage:
        result = GovernedMemory(store).list_retrieval_events(auth=auth, scope_path=scope_path, include_public=include_public, actor=actor, degraded=degraded, query_contains=query_contains, from_time=from_time, to_time=to_time, limit=limit, cursor=cursor, audit_context=AuditContext(request.state.request_id, request.method + ' ' + request.url.path))
        return result

    @app.get('/usage', response_model=UsageResponse, tags=['operations'])
    def usage(request: Request, auth: AuthContext=Depends(require_auth), store: SqliteStore=Depends(get_store), scope_path: str | None=Query(None), include_public: bool=Query(False), from_time: datetime | None=Query(None), to_time: datetime | None=Query(None)) -> UsageResponse:
        result = GovernedMemory(store).usage(auth=auth, scope_path=scope_path, include_public=include_public, from_time=from_time, to_time=to_time, audit_context=AuditContext(request.state.request_id, request.method + ' ' + request.url.path))
        return result
    return app
app = create_app()
