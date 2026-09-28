from __future__ import annotations
from typing import Protocol
from app.schemas import Artifact, ArtifactCreate, AuditEvent, Entity, EntityContext, EntityCreate, EntityPatch, EntityRef, Finding, FindingCreate, FindingResolutionRequest, FindingStatus, FindingType, Lifecycle, ObjectKind, ObjectRef, Record, RecordCreate, RecordPatch, RecordSupersedeRequest, Relation, RelationCreate, RetrievalEvent, Role, ScopePath, SearchResult, SortOrder, utc_now

class IdempotencyConflictError(Exception):
    pass

class VersionConflictError(Exception):
    pass

class RecordStateConflictError(Exception):
    pass

class ObjectConflictError(Exception):
    pass

class Store(Protocol):

    def close(self) -> None:
        ...

    def create_record(self, rec: RecordCreate, *, actor: str) -> Record:
        ...

    def create_record_idempotent(self, rec: RecordCreate, *, actor: str, idempotency_key: str, request_hash: str) -> tuple[Record, bool]:
        ...

    def update_record_idempotent(self, record_id: str, patch: RecordPatch, *, actor: str, expected_version: int, idempotency_key: str, request_hash: str) -> tuple[Record, bool]:
        ...

    def promote_record_idempotent(self, record_id: str, *, actor: str, expected_version: int, reason: str, idempotency_key: str, request_hash: str) -> tuple[Record, bool]:
        ...

    def supersede_record_idempotent(self, record_id: str, replacement: RecordSupersedeRequest, *, actor: str, expected_version: int, reason: str, idempotency_key: str, request_hash: str) -> tuple[Record, bool]:
        ...

    def transition_record_idempotent(self, record_id: str, target: Lifecycle, *, actor: str, expected_version: int, reason: str, idempotency_key: str, request_hash: str) -> tuple[Record, bool]:
        ...

    def get_record(self, record_id: str) -> Record | None:
        ...

    def get_visible_record(self, record_id: str, *, scope_path: str, include_public: bool=False) -> Record | None:
        ...

    def list_records(self, *, scope_path: str, include_public: bool=False) -> list[Record]:
        ...

    def search_records(self, query: str, *, scope_path: str, actor: str, include_public: bool=False, limit: int=25) -> list[SearchResult]:
        ...

    def search_records_page(self, query: str, *, scope_path: str, actor: str, include_public: bool, role: Role | None, lifecycle: Lifecycle | None, entity_type: str | None, entity_id: str | None, tag: str | None, limit: int, cursor: str | None) -> tuple[list[SearchResult], str | None]:
        ...

    def create_entity_idempotent(self, entity: EntityCreate, *, actor: str, idempotency_key: str, request_hash: str) -> tuple[Entity, bool]:
        ...

    def get_entity(self, entity_type: str, entity_id: str) -> Entity | None:
        ...

    def get_visible_entity(self, entity_type: str, entity_id: str, *, scope_path: str, include_public: bool=False) -> Entity | None:
        ...

    def update_entity_idempotent(self, entity_type: str, entity_id: str, patch: EntityPatch, *, actor: str, expected_version: int, idempotency_key: str, request_hash: str) -> tuple[Entity, bool]:
        ...

    def page_entities(self, *, scope_path: str, include_public: bool, entity_type: str | None, name_contains: str | None, sort: str, order: SortOrder, limit: int, cursor: str | None) -> tuple[list[Entity], str | None]:
        ...

    def create_relation_idempotent(self, relation: RelationCreate, *, actor: str, idempotency_key: str, request_hash: str) -> tuple[Relation, bool]:
        ...

    def page_relations(self, *, scope_path: str, include_public: bool, relation_type: str | None, from_kind: ObjectKind | None, from_id: str | None, to_kind: ObjectKind | None, to_id: str | None, limit: int, cursor: str | None) -> tuple[list[Relation], str | None]:
        ...

    def create_artifact_idempotent(self, artifact: ArtifactCreate, *, actor: str, idempotency_key: str, request_hash: str) -> tuple[Artifact, bool]:
        ...

    def page_artifacts(self, *, scope_path: str, include_public: bool, artifact_type: str | None, record_id: str | None, entity_type: str | None, entity_id: str | None, limit: int, cursor: str | None) -> tuple[list[Artifact], str | None]:
        ...

    def page_records(self, *, scope_path: str, include_public: bool, role: Role | None, lifecycle: Lifecycle | None, entity_type: str | None, entity_id: str | None, topic: str | None, tag: str | None, min_confidence: float | None, include_deleted: bool, sort: str, order: SortOrder, limit: int, cursor: str | None) -> tuple[list[Record], str | None]:
        ...

    def get_entity_context(self, entity_type: str, entity_id: str, *, scope_path: str, include_public: bool, limit: int) -> EntityContext | None:
        ...

    def create_finding(self, finding: FindingCreate, *, actor: str) -> Finding:
        ...

    def get_finding(self, finding_id: str) -> Finding | None:
        ...

    def page_findings(self, *, scope_path: str, include_public: bool, finding_type: FindingType | None, status: FindingStatus | None, subject_kind: ObjectKind | None, subject_id: str | None, limit: int, cursor: str | None) -> tuple[list[Finding], str | None]:
        ...

    def resolve_finding_idempotent(self, finding_id: str, resolution: FindingResolutionRequest, *, actor: str, expected_version: int, reason: str, idempotency_key: str, request_hash: str) -> tuple[Finding, bool]:
        ...

    def page_audit_events(self, *, scope_path: str, include_public: bool, action: str | None, object_type: str | None, object_id: str | None, actor: str | None, from_time: str | None, to_time: str | None, limit: int, cursor: str | None) -> tuple[list[AuditEvent], str | None]:
        ...

    def page_retrieval_events(self, *, scope_path: str, include_public: bool, actor: str | None, degraded: bool | None, query_contains: str | None, from_time: str | None, to_time: str | None, limit: int, cursor: str | None) -> tuple[list[RetrievalEvent], str | None]:
        ...

    def usage_summary(self, *, scope_path: str, include_public: bool, from_time: str | None, to_time: str | None) -> tuple[dict[str, object], dict[str, int]]:
        ...

    def reference_visible(self, ref: ObjectRef, *, scope_path: str) -> bool:
        ...

    def write_denial(self, *, operation: str, actor: str, scope_path: str, request_id: str, status_code: int, reason: str | None) -> None:
        ...

    def count_audit_events(self, *, action: str | None=None) -> int:
        ...

    def count_retrieval_events(self, *, query: str | None=None) -> int:
        ...
