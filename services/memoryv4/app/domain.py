from __future__ import annotations
from app.contracts import CONTRACT_VERSION, CapabilitiesResponse, ErrorBody, ErrorResponse, Permission, SchemaContractResponse, WritePolicy, capabilities, schema_contract
from app.pagination import CursorError
from app.schemas import Artifact, ArtifactCreate, ArtifactPage, AuditEventPage, Entity, EntityContext, EntityCreate, EntityPage, EntityPatch, Finding, FindingPage, FindingResolutionRequest, FindingStatus, FindingType, Lifecycle, ObjectKind, Record, RecordCreate, RecordPage, RecordPatch, RecordSupersedeRequest, RecordTransitionRequest, Relation, RelationCreate, RelationPage, RetrievalEventPage, Role, ScopePath, SearchPage, SortOrder, UsageResponse
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

class AuthContext:

    def __init__(self, grant: ApiKeyGrant, *, delegated_actor: str | None=None):
        self.actor = delegated_actor or grant.actor
        self.scope_path = ScopePath.validate(grant.scope_path)
        self.permissions = grant.permissions

    def has(self, permission: Permission) -> bool:
        return Permission('memory.admin') in self.permissions or permission in self.permissions

def _api_error(status_code: int, code: str, message: str, **details: object) -> DomainError:
    return DomainError(status_code=status_code, detail={'code': code, 'message': message, 'details': details})

def _authorize_effective_scope(requested_scope: str, auth: AuthContext) -> None:
    if not ScopePath.is_descendant_or_equal(requested_scope, auth.scope_path):
        raise _api_error(403, 'forbidden', 'scope outside actor grant')

def _require_permission(auth: AuthContext, permission: Permission) -> None:
    if not auth.has(permission):
        raise _api_error(403, 'forbidden', 'required permission missing', required_permission=permission.value)

def _validate_idempotency_key(value: str | None) -> str:
    if value is None:
        raise _api_error(428, 'precondition_required', 'Idempotency-Key header required')
    if value != value.strip() or not 8 <= len(value) <= 200:
        raise _api_error(422, 'invalid_request', 'Idempotency-Key must be trimmed and contain 8 to 200 characters')
    return value

def _parse_version(value: str | None) -> int:
    if value is None:
        raise _api_error(428, 'precondition_required', 'If-Match header required')
    normalized = value.strip()
    if normalized.startswith('W/"') or normalized.startswith("W/'"):
        raise _api_error(422, 'invalid_request', 'weak If-Match values are not supported')
    normalized = normalized.strip('"')
    try:
        version = int(normalized)
    except ValueError as exc:
        raise _api_error(422, 'invalid_request', 'If-Match must contain an integer version') from exc
    if version < 1:
        raise _api_error(422, 'invalid_request', 'If-Match version must be positive')
    return version

def _validate_reason(value: str | None, action: str) -> str:
    if value is None or not value.strip() or value != value.strip() or (len(value) > 500):
        raise _api_error(422, 'invalid_request', f'a trimmed {action} reason is required')
    return value

def _normalize_time_bound(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        raise _api_error(422, 'invalid_request', 'time bounds must include a timezone')
    return value.astimezone(timezone.utc).isoformat(timespec='seconds')

def _validate_time_window(from_time: datetime | None, to_time: datetime | None) -> tuple[str | None, str | None]:
    start = _normalize_time_bound(from_time)
    end = _normalize_time_bound(to_time)
    if start is not None and end is not None and (start > end):
        raise _api_error(422, 'invalid_request', 'from_time must not exceed to_time')
    return (start, end)

def _request_hash(operation: str, payload: object) -> str:
    canonical = json.dumps({'operation': operation, 'payload': payload}, sort_keys=True, separators=(',', ':'), ensure_ascii=False)
    return hashlib.sha256(canonical.encode('utf-8')).hexdigest()

def _authorize_create(record: RecordCreate, auth: AuthContext) -> None:
    _authorize_effective_scope(record.scope_path, auth)
    if record.lifecycle not in {Lifecycle.live, Lifecycle.working}:
        raise _api_error(422, 'invalid_request', 'new records must start live or working; governed transitions own terminal states')
    if auth.has(Permission.create):
        if record.role == Role.canonical:
            _require_permission(auth, Permission.promote)
            if record.lifecycle != Lifecycle.live:
                raise _api_error(422, 'invalid_request', 'canonical records must be live')
        return
    if auth.has(Permission.create_working):
        if record.role != Role.active or record.lifecycle != Lifecycle.working:
            raise _api_error(403, 'forbidden', 'memory.create-working may create only active/working candidates')
        return
    _require_permission(auth, Permission.create)

def _authorize_record_edit(record: Record, auth: AuthContext) -> None:
    _require_permission(auth, Permission.edit)
    if record.role == Role.canonical:
        raise _api_error(409, 'conflict', 'canonical records must be revised by supersession')
    if record.write_policy == WritePolicy.immutable:
        raise _api_error(409, 'conflict', 'immutable records cannot be edited')
    if Permission('memory.admin') in auth.permissions:
        return
    if record.write_policy == WritePolicy.admin_only:
        raise _api_error(403, 'forbidden', 'record write policy requires memory.admin')
    if record.write_policy == WritePolicy.author_only and record.author_actor != auth.actor:
        raise _api_error(403, 'forbidden', 'record write policy permits only its author')

def _authorize_record_supersede(record: Record, auth: AuthContext) -> None:
    _require_permission(auth, Permission.edit)
    if Permission('memory.admin') in auth.permissions:
        return
    if record.write_policy == WritePolicy.admin_only:
        raise _api_error(403, 'forbidden', 'record write policy requires memory.admin')
    if record.write_policy in {WritePolicy.author_only, WritePolicy.immutable}:
        if record.author_actor != auth.actor:
            raise _api_error(403, 'forbidden', 'record supersession permits only its author')

class GovernedMemory:

    def __init__(self, store: Store):
        self.store = store

    def create_entity(self, *, entity: EntityCreate, auth: AuthContext, idempotency_key: str | None=None, audit_context: AuditContext=AuditContext()) -> MutationResult:
        store = self.store
        reason = None
        try:
            _require_permission(auth, Permission.create)
            _authorize_effective_scope(entity.scope_path, auth)
            key = _validate_idempotency_key(idempotency_key)
            digest = _request_hash('entity.create', entity.model_dump(mode='json'))
            try:
                (created, replayed) = store.create_entity_idempotent(entity, actor=auth.actor, idempotency_key=key, request_hash=digest)
            except IdempotencyConflictError as exc:
                raise _api_error(409, 'idempotency_conflict', 'Idempotency-Key conflict') from exc
            except ObjectConflictError as exc:
                raise _api_error(409, 'conflict', 'entity identity already exists') from exc
            return MutationResult(created, replayed)
        except DomainError as exc:
            try:
                store.write_denial(operation=audit_context.operation, actor=auth.actor, scope_path=auth.scope_path, request_id=audit_context.request_id, status_code=exc.status_code, reason=str(locals().get('reason') or '')[:500] or None)
                exc.audited = True
            except Exception:
                pass
            raise

    def list_entities(self, *, auth: AuthContext, scope_path: str | None=None, include_public: bool=False, entity_type: str | None=None, name_contains: str | None=None, sort: str='updated_at', order: SortOrder=SortOrder.desc, limit: int=50, cursor: str | None=None, audit_context: AuditContext=AuditContext()) -> EntityPage:
        store = self.store
        _require_permission(auth, Permission.read)
        effective_scope = ScopePath.validate(scope_path or auth.scope_path)
        _authorize_effective_scope(effective_scope, auth)
        try:
            (entities, next_cursor) = store.page_entities(scope_path=effective_scope, include_public=include_public, entity_type=entity_type, name_contains=name_contains, sort=sort, order=order, limit=limit, cursor=cursor)
        except CursorError as exc:
            raise _api_error(422, 'invalid_request', str(exc)) from exc
        return EntityPage(entities=entities, next_cursor=next_cursor)

    def get_entity(self, *, entity_type: str, entity_id: str, auth: AuthContext, scope_path: str | None=None, include_public: bool=False, audit_context: AuditContext=AuditContext()) -> Entity:
        store = self.store
        _require_permission(auth, Permission.read)
        effective_scope = ScopePath.validate(scope_path or auth.scope_path)
        _authorize_effective_scope(effective_scope, auth)
        entity = store.get_visible_entity(entity_type, entity_id, scope_path=effective_scope, include_public=include_public)
        if entity is None:
            raise _api_error(404, 'not_found', 'entity not found')
        return entity

    def patch_entity(self, *, entity_type: str, entity_id: str, patch: EntityPatch, auth: AuthContext, idempotency_key: str | None=None, if_match: str | None=None, audit_context: AuditContext=AuditContext()) -> MutationResult:
        store = self.store
        reason = None
        try:
            _require_permission(auth, Permission.edit)
            key = _validate_idempotency_key(idempotency_key)
            expected_version = _parse_version(if_match)
            current = store.get_entity(entity_type, entity_id)
            if current is None or not ScopePath.is_descendant_or_equal(current.scope_path, auth.scope_path):
                raise _api_error(404, 'not_found', 'entity not found')
            digest = _request_hash(f'entity.patch:{entity_type}:{entity_id}', {'version': expected_version, 'patch': patch.model_dump(mode='json', exclude_unset=True)})
            try:
                (updated, replayed) = store.update_entity_idempotent(entity_type, entity_id, patch, actor=auth.actor, expected_version=expected_version, idempotency_key=key, request_hash=digest)
            except IdempotencyConflictError as exc:
                raise _api_error(409, 'idempotency_conflict', 'Idempotency-Key conflict') from exc
            except VersionConflictError as exc:
                raise _api_error(412, 'version_conflict', 'entity version does not match') from exc
            return MutationResult(updated, replayed)
        except DomainError as exc:
            try:
                store.write_denial(operation=audit_context.operation, actor=auth.actor, scope_path=auth.scope_path, request_id=audit_context.request_id, status_code=exc.status_code, reason=str(locals().get('reason') or '')[:500] or None)
                exc.audited = True
            except Exception:
                pass
            raise

    def create_record(self, *, record: RecordCreate, auth: AuthContext, idempotency_key: str | None=None, audit_context: AuditContext=AuditContext()) -> MutationResult:
        store = self.store
        reason = None
        try:
            key = _validate_idempotency_key(idempotency_key)
            _authorize_create(record, auth)
            digest = _request_hash('record.create', record.model_dump(mode='json'))
            try:
                (created, replayed) = store.create_record_idempotent(record, actor=auth.actor, idempotency_key=key, request_hash=digest)
            except IdempotencyConflictError as exc:
                raise _api_error(409, 'idempotency_conflict', 'Idempotency-Key was already used for a different request') from exc
            except KeyError as exc:
                raise _api_error(404, 'not_found', 'linked entity not found in record scope') from exc
            return MutationResult(created, replayed)
        except DomainError as exc:
            try:
                store.write_denial(operation=audit_context.operation, actor=auth.actor, scope_path=auth.scope_path, request_id=audit_context.request_id, status_code=exc.status_code, reason=str(locals().get('reason') or '')[:500] or None)
                exc.audited = True
            except Exception:
                pass
            raise

    def list_records(self, *, auth: AuthContext, scope_path: str | None=None, include_public: bool=False, role: Role | None=None, lifecycle: Lifecycle | None=None, entity_type: str | None=None, entity_id: str | None=None, topic: str | None=None, tag: str | None=None, min_confidence: float | None=None, include_deleted: bool=False, sort: str='updated_at', order: SortOrder=SortOrder.desc, limit: int=50, cursor: str | None=None, audit_context: AuditContext=AuditContext()) -> RecordPage:
        store = self.store
        _require_permission(auth, Permission.read)
        if include_deleted:
            _require_permission(auth, Permission.archive)
        if (entity_type is None) != (entity_id is None):
            raise _api_error(422, 'invalid_request', 'entity_type and entity_id must be supplied together')
        effective_scope = ScopePath.validate(scope_path or auth.scope_path)
        _authorize_effective_scope(effective_scope, auth)
        try:
            (records, next_cursor) = store.page_records(scope_path=effective_scope, include_public=include_public, role=role, lifecycle=lifecycle, entity_type=entity_type, entity_id=entity_id, topic=topic, tag=tag, min_confidence=min_confidence, include_deleted=include_deleted, sort=sort, order=order, limit=limit, cursor=cursor)
        except CursorError as exc:
            raise _api_error(422, 'invalid_request', str(exc)) from exc
        return RecordPage(records=records, next_cursor=next_cursor)

    def get_record(self, *, record_id: str, auth: AuthContext, scope_path: str | None=None, include_public: bool=False, audit_context: AuditContext=AuditContext()) -> Record:
        store = self.store
        _require_permission(auth, Permission.read)
        effective_scope = ScopePath.validate(scope_path or auth.scope_path)
        _authorize_effective_scope(effective_scope, auth)
        record = store.get_visible_record(record_id, scope_path=effective_scope, include_public=include_public)
        if record is None:
            raise _api_error(404, 'not_found', 'record not found')
        return record

    def patch_record(self, *, record_id: str, patch: RecordPatch, auth: AuthContext, idempotency_key: str | None=None, if_match: str | None=None, audit_context: AuditContext=AuditContext()) -> MutationResult:
        store = self.store
        reason = None
        try:
            key = _validate_idempotency_key(idempotency_key)
            expected_version = _parse_version(if_match)
            record = store.get_record(record_id)
            if record is None or not ScopePath.is_descendant_or_equal(record.scope_path, auth.scope_path):
                raise _api_error(404, 'not_found', 'record not found')
            _authorize_record_edit(record, auth)
            if patch.write_policy is not None and record.author_actor != auth.actor and (Permission('memory.admin') not in auth.permissions):
                raise _api_error(403, 'forbidden', 'only the author or memory.admin may change write policy')
            digest = _request_hash(f'record.patch:{record_id}', {'version': expected_version, 'patch': patch.model_dump(mode='json', exclude_unset=True)})
            try:
                (updated, replayed) = store.update_record_idempotent(record_id, patch, actor=auth.actor, expected_version=expected_version, idempotency_key=key, request_hash=digest)
            except IdempotencyConflictError as exc:
                raise _api_error(409, 'idempotency_conflict', 'Idempotency-Key conflict') from exc
            except KeyError as exc:
                raise _api_error(404, 'not_found', 'linked entity not found in record scope') from exc
            except VersionConflictError as exc:
                raise _api_error(412, 'version_conflict', 'record version does not match') from exc
            return MutationResult(updated, replayed)
        except DomainError as exc:
            try:
                store.write_denial(operation=audit_context.operation, actor=auth.actor, scope_path=auth.scope_path, request_id=audit_context.request_id, status_code=exc.status_code, reason=str(locals().get('reason') or '')[:500] or None)
                exc.audited = True
            except Exception:
                pass
            raise

    def supersede_record(self, *, record_id: str, replacement: RecordSupersedeRequest, auth: AuthContext, idempotency_key: str | None=None, if_match: str | None=None, reason: str | None=None, audit_context: AuditContext=AuditContext()) -> MutationResult:
        store = self.store
        try:
            key = _validate_idempotency_key(idempotency_key)
            expected_version = _parse_version(if_match)
            validated_reason = _validate_reason(reason, 'supersession')
            current = store.get_record(record_id)
            if current is None or not ScopePath.is_descendant_or_equal(current.scope_path, auth.scope_path):
                raise _api_error(404, 'not_found', 'record not found')
            _authorize_record_supersede(current, auth)
            if replacement.write_policy is not None and current.author_actor != auth.actor and (Permission('memory.admin') not in auth.permissions):
                raise _api_error(403, 'forbidden', 'only the author or memory.admin may change replacement write policy')
            digest = _request_hash(f'record.supersede:{record_id}', {'version': expected_version, 'reason': validated_reason, 'replacement': replacement.model_dump(mode='json', exclude_unset=True)})
            try:
                (superseding, replayed) = store.supersede_record_idempotent(record_id, replacement, actor=auth.actor, expected_version=expected_version, reason=validated_reason, idempotency_key=key, request_hash=digest)
            except IdempotencyConflictError as exc:
                raise _api_error(409, 'idempotency_conflict', 'Idempotency-Key conflict') from exc
            except KeyError as exc:
                raise _api_error(404, 'not_found', 'linked entity not found in record scope') from exc
            except RecordStateConflictError as exc:
                raise _api_error(409, 'conflict', 'only live or working records can be superseded') from exc
            except VersionConflictError as exc:
                raise _api_error(412, 'version_conflict', 'record version does not match') from exc
            return MutationResult(superseding, replayed)
        except DomainError as exc:
            try:
                store.write_denial(operation=audit_context.operation, actor=auth.actor, scope_path=auth.scope_path, request_id=audit_context.request_id, status_code=exc.status_code, reason=str(locals().get('reason') or '')[:500] or None)
                exc.audited = True
            except Exception:
                pass
            raise

    def transition_record(self, *, record_id: str, transition: RecordTransitionRequest, auth: AuthContext, idempotency_key: str | None=None, if_match: str | None=None, reason: str | None=None, audit_context: AuditContext=AuditContext()) -> MutationResult:
        store = self.store
        try:
            _require_permission(auth, Permission.archive)
            key = _validate_idempotency_key(idempotency_key)
            expected_version = _parse_version(if_match)
            validated_reason = _validate_reason(reason, 'lifecycle transition')
            current = store.get_record(record_id)
            if current is None or not ScopePath.is_descendant_or_equal(current.scope_path, auth.scope_path):
                raise _api_error(404, 'not_found', 'record not found')
            digest = _request_hash(f'record.transition:{record_id}', {'version': expected_version, 'reason': validated_reason, 'lifecycle': transition.lifecycle.value})
            try:
                (transitioned, replayed) = store.transition_record_idempotent(record_id, transition.lifecycle, actor=auth.actor, expected_version=expected_version, reason=validated_reason, idempotency_key=key, request_hash=digest)
            except IdempotencyConflictError as exc:
                raise _api_error(409, 'idempotency_conflict', 'Idempotency-Key conflict') from exc
            except RecordStateConflictError as exc:
                raise _api_error(409, 'conflict', 'invalid record lifecycle transition') from exc
            except VersionConflictError as exc:
                raise _api_error(412, 'version_conflict', 'record version does not match') from exc
            return MutationResult(transitioned, replayed)
        except DomainError as exc:
            try:
                store.write_denial(operation=audit_context.operation, actor=auth.actor, scope_path=auth.scope_path, request_id=audit_context.request_id, status_code=exc.status_code, reason=str(locals().get('reason') or '')[:500] or None)
                exc.audited = True
            except Exception:
                pass
            raise

    def promote_record(self, *, record_id: str, auth: AuthContext, idempotency_key: str | None=None, if_match: str | None=None, reason: str | None=None, audit_context: AuditContext=AuditContext()) -> MutationResult:
        store = self.store
        try:
            _require_permission(auth, Permission.promote)
            key = _validate_idempotency_key(idempotency_key)
            expected_version = _parse_version(if_match)
            validated_reason = _validate_reason(reason, 'promotion')
            record = store.get_record(record_id)
            if record is None or not ScopePath.is_descendant_or_equal(record.scope_path, auth.scope_path):
                raise _api_error(404, 'not_found', 'record not found')
            digest = _request_hash(f'record.promote:{record_id}', {'version': expected_version, 'reason': validated_reason})
            try:
                (promoted, replayed) = store.promote_record_idempotent(record_id, actor=auth.actor, expected_version=expected_version, reason=validated_reason, idempotency_key=key, request_hash=digest)
            except IdempotencyConflictError as exc:
                raise _api_error(409, 'idempotency_conflict', 'Idempotency-Key conflict') from exc
            except RecordStateConflictError as exc:
                raise _api_error(409, 'conflict', 'only active/working candidates can be promoted') from exc
            except VersionConflictError as exc:
                raise _api_error(412, 'version_conflict', 'record version does not match') from exc
            return MutationResult(promoted, replayed)
        except DomainError as exc:
            try:
                store.write_denial(operation=audit_context.operation, actor=auth.actor, scope_path=auth.scope_path, request_id=audit_context.request_id, status_code=exc.status_code, reason=str(locals().get('reason') or '')[:500] or None)
                exc.audited = True
            except Exception:
                pass
            raise

    def create_relation(self, *, relation: RelationCreate, auth: AuthContext, idempotency_key: str | None=None, audit_context: AuditContext=AuditContext()) -> MutationResult:
        store = self.store
        reason = None
        try:
            _require_permission(auth, Permission.create)
            _authorize_effective_scope(relation.scope_path, auth)
            key = _validate_idempotency_key(idempotency_key)
            digest = _request_hash('relation.create', relation.model_dump(mode='json', by_alias=True))
            try:
                (created, replayed) = store.create_relation_idempotent(relation, actor=auth.actor, idempotency_key=key, request_hash=digest)
            except IdempotencyConflictError as exc:
                raise _api_error(409, 'idempotency_conflict', 'Idempotency-Key conflict') from exc
            except KeyError as exc:
                raise _api_error(404, 'not_found', 'relation endpoint not found in scope') from exc
            return MutationResult(created, replayed)
        except DomainError as exc:
            try:
                store.write_denial(operation=audit_context.operation, actor=auth.actor, scope_path=auth.scope_path, request_id=audit_context.request_id, status_code=exc.status_code, reason=str(locals().get('reason') or '')[:500] or None)
                exc.audited = True
            except Exception:
                pass
            raise

    def list_relations(self, *, auth: AuthContext, scope_path: str | None=None, include_public: bool=False, relation_type: str | None=None, from_kind: ObjectKind | None=None, from_id: str | None=None, to_kind: ObjectKind | None=None, to_id: str | None=None, limit: int=50, cursor: str | None=None, audit_context: AuditContext=AuditContext()) -> RelationPage:
        store = self.store
        _require_permission(auth, Permission.read)
        effective_scope = ScopePath.validate(scope_path or auth.scope_path)
        _authorize_effective_scope(effective_scope, auth)
        try:
            (relations, next_cursor) = store.page_relations(scope_path=effective_scope, include_public=include_public, relation_type=relation_type, from_kind=from_kind, from_id=from_id, to_kind=to_kind, to_id=to_id, limit=limit, cursor=cursor)
        except CursorError as exc:
            raise _api_error(422, 'invalid_request', str(exc)) from exc
        return RelationPage(relations=relations, next_cursor=next_cursor)

    def create_artifact(self, *, artifact: ArtifactCreate, auth: AuthContext, idempotency_key: str | None=None, audit_context: AuditContext=AuditContext()) -> MutationResult:
        store = self.store
        reason = None
        try:
            _require_permission(auth, Permission.create)
            _authorize_effective_scope(artifact.scope_path, auth)
            key = _validate_idempotency_key(idempotency_key)
            digest = _request_hash('artifact.create', artifact.model_dump(mode='json'))
            try:
                (created, replayed) = store.create_artifact_idempotent(artifact, actor=auth.actor, idempotency_key=key, request_hash=digest)
            except IdempotencyConflictError as exc:
                raise _api_error(409, 'idempotency_conflict', 'Idempotency-Key conflict') from exc
            except KeyError as exc:
                raise _api_error(404, 'not_found', 'artifact target not found in scope') from exc
            return MutationResult(created, replayed)
        except DomainError as exc:
            try:
                store.write_denial(operation=audit_context.operation, actor=auth.actor, scope_path=auth.scope_path, request_id=audit_context.request_id, status_code=exc.status_code, reason=str(locals().get('reason') or '')[:500] or None)
                exc.audited = True
            except Exception:
                pass
            raise

    def list_artifacts(self, *, auth: AuthContext, scope_path: str | None=None, include_public: bool=False, artifact_type: str | None=None, record_id: str | None=None, entity_type: str | None=None, entity_id: str | None=None, limit: int=50, cursor: str | None=None, audit_context: AuditContext=AuditContext()) -> ArtifactPage:
        store = self.store
        _require_permission(auth, Permission.read)
        if (entity_type is None) != (entity_id is None):
            raise _api_error(422, 'invalid_request', 'entity_type and entity_id must be supplied together')
        effective_scope = ScopePath.validate(scope_path or auth.scope_path)
        _authorize_effective_scope(effective_scope, auth)
        try:
            (artifacts, next_cursor) = store.page_artifacts(scope_path=effective_scope, include_public=include_public, artifact_type=artifact_type, record_id=record_id, entity_type=entity_type, entity_id=entity_id, limit=limit, cursor=cursor)
        except CursorError as exc:
            raise _api_error(422, 'invalid_request', str(exc)) from exc
        return ArtifactPage(artifacts=artifacts, next_cursor=next_cursor)

    def get_context(self, *, entity_type: str, entity_id: str, auth: AuthContext, scope_path: str | None=None, include_public: bool=False, limit: int=50, audit_context: AuditContext=AuditContext()) -> EntityContext:
        store = self.store
        _require_permission(auth, Permission.read)
        effective_scope = ScopePath.validate(scope_path or auth.scope_path)
        _authorize_effective_scope(effective_scope, auth)
        context = store.get_entity_context(entity_type, entity_id, scope_path=effective_scope, include_public=include_public, limit=limit)
        if context is None:
            raise _api_error(404, 'not_found', 'entity not found')
        return context

    def search(self, *, auth: AuthContext, q: str, scope_path: str | None=None, include_public: bool=False, role: Role | None=None, lifecycle: Lifecycle | None=None, entity_type: str | None=None, entity_id: str | None=None, tag: str | None=None, limit: int=25, cursor: str | None=None, audit_context: AuditContext=AuditContext()) -> SearchPage:
        store = self.store
        _require_permission(auth, Permission.search)
        if (entity_type is None) != (entity_id is None):
            raise _api_error(422, 'invalid_request', 'entity_type and entity_id must be supplied together')
        effective_scope = ScopePath.validate(scope_path or auth.scope_path)
        _authorize_effective_scope(effective_scope, auth)
        try:
            (results, next_cursor) = store.search_records_page(q, scope_path=effective_scope, actor=auth.actor, include_public=include_public, role=role, lifecycle=lifecycle, entity_type=entity_type, entity_id=entity_id, tag=tag, limit=limit, cursor=cursor)
        except CursorError as exc:
            raise _api_error(422, 'invalid_request', str(exc)) from exc
        return SearchPage(results=results, next_cursor=next_cursor)

    def list_findings(self, *, auth: AuthContext, scope_path: str | None=None, include_public: bool=False, finding_type: FindingType | None=None, finding_status: FindingStatus | None=None, subject_kind: ObjectKind | None=None, subject_id: str | None=None, limit: int=50, cursor: str | None=None, audit_context: AuditContext=AuditContext()) -> FindingPage:
        store = self.store
        _require_permission(auth, Permission('memory.review'))
        effective_scope = ScopePath.validate(scope_path or auth.scope_path)
        _authorize_effective_scope(effective_scope, auth)
        try:
            (findings, next_cursor) = store.page_findings(scope_path=effective_scope, include_public=include_public, finding_type=finding_type, status=finding_status, subject_kind=subject_kind, subject_id=subject_id, limit=limit, cursor=cursor)
        except CursorError as exc:
            raise _api_error(422, 'invalid_request', str(exc)) from exc
        return FindingPage(findings=findings, next_cursor=next_cursor)

    def resolve_finding(self, *, finding_id: str, resolution: FindingResolutionRequest, auth: AuthContext, idempotency_key: str | None=None, if_match: str | None=None, reason: str | None=None, audit_context: AuditContext=AuditContext()) -> MutationResult:
        store = self.store
        try:
            _require_permission(auth, Permission('memory.review'))
            key = _validate_idempotency_key(idempotency_key)
            expected_version = _parse_version(if_match)
            validated_reason = _validate_reason(reason, 'finding resolution')
            current = store.get_finding(finding_id)
            if current is None or not ScopePath.is_descendant_or_equal(current.scope_path, auth.scope_path):
                raise _api_error(404, 'not_found', 'finding not found')
            digest = _request_hash(f'finding.resolve:{finding_id}', {'version': expected_version, 'reason': validated_reason, 'resolution': resolution.model_dump(mode='json')})
            try:
                (updated, replayed) = store.resolve_finding_idempotent(finding_id, resolution, actor=auth.actor, expected_version=expected_version, reason=validated_reason, idempotency_key=key, request_hash=digest)
            except IdempotencyConflictError as exc:
                raise _api_error(409, 'idempotency_conflict', 'Idempotency-Key conflict') from exc
            except KeyError as exc:
                raise _api_error(404, 'not_found', 'finding not found') from exc
            except VersionConflictError as exc:
                raise _api_error(412, 'version_conflict', 'finding version does not match') from exc
            except RecordStateConflictError as exc:
                raise _api_error(409, 'conflict', 'finding is already closed') from exc
            return MutationResult(updated, replayed)
        except DomainError as exc:
            try:
                store.write_denial(operation=audit_context.operation, actor=auth.actor, scope_path=auth.scope_path, request_id=audit_context.request_id, status_code=exc.status_code, reason=str(locals().get('reason') or '')[:500] or None)
                exc.audited = True
            except Exception:
                pass
            raise

    def list_audit_events(self, *, auth: AuthContext, scope_path: str | None=None, include_public: bool=False, action: str | None=None, object_type: str | None=None, object_id: str | None=None, actor: str | None=None, from_time: datetime | None=None, to_time: datetime | None=None, limit: int=50, cursor: str | None=None, audit_context: AuditContext=AuditContext()) -> AuditEventPage:
        store = self.store
        _require_permission(auth, Permission('memory.audit.read'))
        effective_scope = ScopePath.validate(scope_path or auth.scope_path)
        _authorize_effective_scope(effective_scope, auth)
        (start, end) = _validate_time_window(from_time, to_time)
        try:
            (events, next_cursor) = store.page_audit_events(scope_path=effective_scope, include_public=include_public, action=action, object_type=object_type, object_id=object_id, actor=actor, from_time=start, to_time=end, limit=limit, cursor=cursor)
        except CursorError as exc:
            raise _api_error(422, 'invalid_request', str(exc)) from exc
        return AuditEventPage(events=events, next_cursor=next_cursor)

    def list_retrieval_events(self, *, auth: AuthContext, scope_path: str | None=None, include_public: bool=False, actor: str | None=None, degraded: bool | None=None, query_contains: str | None=None, from_time: datetime | None=None, to_time: datetime | None=None, limit: int=50, cursor: str | None=None, audit_context: AuditContext=AuditContext()) -> RetrievalEventPage:
        store = self.store
        _require_permission(auth, Permission('memory.audit.read'))
        effective_scope = ScopePath.validate(scope_path or auth.scope_path)
        _authorize_effective_scope(effective_scope, auth)
        (start, end) = _validate_time_window(from_time, to_time)
        try:
            (events, next_cursor) = store.page_retrieval_events(scope_path=effective_scope, include_public=include_public, actor=actor, degraded=degraded, query_contains=query_contains, from_time=start, to_time=end, limit=limit, cursor=cursor)
        except CursorError as exc:
            raise _api_error(422, 'invalid_request', str(exc)) from exc
        return RetrievalEventPage(events=events, next_cursor=next_cursor)

    def usage(self, *, auth: AuthContext, scope_path: str | None=None, include_public: bool=False, from_time: datetime | None=None, to_time: datetime | None=None, audit_context: AuditContext=AuditContext()) -> UsageResponse:
        store = self.store
        _require_permission(auth, Permission('memory.admin'))
        effective_scope = ScopePath.validate(scope_path or auth.scope_path)
        _authorize_effective_scope(effective_scope, auth)
        (start, end) = _validate_time_window(from_time, to_time)
        (objects, events) = store.usage_summary(scope_path=effective_scope, include_public=include_public, from_time=start, to_time=end)
        return UsageResponse(scope_path=effective_scope, include_public=include_public, from_time=start, to_time=end, objects=objects, events=events)
