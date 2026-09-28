import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import pytest
from app.domain import AuthContext, GovernedMemory, DomainError
from app.settings import _parse_grant
from app.storage import SqliteStore
from app.schemas import EntityCreate, RecordCreate, RelationCreate, ArtifactCreate, EntityRef, ObjectRef, RecordSupersedeRequest
from app.exchange import ExchangeAuthority, ExchangeError, export_graph, import_graph, encoded, MODELS
from app.sqlite_graph import SqliteGraph, TABLES

ROOT='tenant:offline'
def auth(actor='operator:fixture',root=ROOT,permissions=None):
    return AuthContext(_parse_grant('offline-exchange', {'actor':actor,'scope_path':root,'permissions':permissions or ['memory.admin']}))
def authority(**changes):
    return ExchangeAuthority(auth(),allow_export=changes.get('export',True),allow_import=changes.get('import_',True),allow_canonical=changes.get('canonical',True))
def seed(path):
    store=SqliteStore(Path(path)); d=GovernedMemory(store); a=auth()
    e=d.create_entity(entity=EntityCreate(entity_type='project',name='fixture',scope_path=ROOT,attrs={'owner':'fixture'}),auth=a,idempotency_key='entity-key').value
    records=[]
    for i,(role,life,policy) in enumerate([('canonical','live','immutable'),('active','working','author_only'),('evidence','live','team_editable'),('exhaust','working','admin_only')]):
        rec=RecordCreate(title=f'graph{i}',content='portable lexical content',role=role,lifecycle=life,write_policy=policy,scope_path=ROOT,entity=EntityRef(entity_type=e.entity_type,id=e.id),tags=['portable'],source_refs=['urn:fixture:source'],provenance={'source':'fixture','assertion':i},attrs={'object':{'a':1}})
        records.append(d.create_record(record=rec,auth=a,idempotency_key=f'record-key-{i}').value)
    d.create_relation(relation=RelationCreate(from_ref=ObjectRef(kind='record',id=records[1].id),to_ref=ObjectRef(kind='entity',entity_type=e.entity_type,id=e.id),relation_type='about',scope_path=ROOT,provenance={'source':'fixture'}),auth=a,idempotency_key='relation-key')
    d.create_artifact(artifact=ArtifactCreate(record_id=records[1].id,artifact_type='document',uri='urn:fixture:unavailable-bytes',checksum='sha256:'+('a'*64),scope_path=ROOT),auth=a,idempotency_key='artifact-key')
    replacement=d.supersede_record(record_id=records[0].id,replacement=RecordSupersedeRequest(content='canonical revision'),auth=a,idempotency_key='supersede-key',if_match='1',reason='fixture canonical revision').value
    from app.schemas import FindingCreate
    store.create_finding(FindingCreate(finding_type='candidate',subject=ObjectRef(kind='record',id=records[1].id),scope_path=ROOT,detail={'source':'fixture review'}),actor=a.actor)
    d.search(auth=a,q='portable',scope_path=ROOT)
    return store,[store.get_record(r.id) for r in [*records,replacement]]

def counts(store):
    with store._connect() as c:return {t:c.execute('SELECT COUNT(*) FROM '+TABLES.get(t,t)).fetchone()[0] for t in [*MODELS,'idempotency_requests']}
def resign(body):
    body.pop('integrity',None);return encoded({**body,'integrity':{'algorithm':'sha256','digest':hashlib.sha256(encoded(body)).hexdigest()}})

def test_complete_semantic_roundtrip_and_restricted_domain(tmp_path):
    source,records=seed(tmp_path/'source.db'); a=authority(); raw=export_graph(SqliteGraph(source),a)
    assert raw==export_graph(SqliteGraph(source),a)
    target=SqliteStore(Path(tmp_path/'fresh.db')); receipt=import_graph(SqliteGraph(target),raw,a)
    assert receipt['replayLedgerImported'] is False
    assert export_graph(SqliteGraph(target),a)==raw
    assert counts(source)['idempotency_requests']>0 and counts(target)['idempotency_requests']==0
    assert counts(target)['audit_events']==counts(source)['audit_events']+1
    current=GovernedMemory(target)
    for r in records:
        got=target.get_record(r.id);assert got.model_dump()==r.model_dump()
    # Imported canonical identity/state is preserved, never silently demoted/promoted or mutable.
    from app.schemas import RecordPatch
    with pytest.raises(DomainError) as denial:
        current.patch_record(record_id=records[0].id,patch=RecordPatch(content='overwrite'),auth=auth(),idempotency_key='deny-key',if_match='1')
    assert denial.value.status_code==409
    assert denial.value.audited is True
    with pytest.raises(DomainError) as policy_denial:
        current.patch_record(record_id=records[1].id,patch=RecordPatch(content='overwrite'),auth=auth(actor='other',permissions=['memory.read','memory.edit']),idempotency_key='deny-other',if_match='1')
    assert policy_denial.value.status_code==403 and policy_denial.value.audited is True
    assert current.search(auth=auth(),q='portable',scope_path=ROOT).results
    with pytest.raises(ExchangeError):import_graph(SqliteGraph(target),raw,a)
    # Retained domain receipts remain replayable on source after graph export.
    assert counts(source)['idempotency_requests']>0

@pytest.mark.parametrize('change',['missing-import','no-admin','narrow-scope','canonical'])
def test_exchange_authority_precedes_all_writes(tmp_path,change):
    source,_=seed(tmp_path/'source.db');raw=export_graph(SqliteGraph(source),authority());target=SqliteStore(Path(tmp_path/'target.db'))
    a=authority()
    if change=='missing-import':a=authority(import_=False)
    if change=='no-admin':a=ExchangeAuthority(auth(permissions=['memory.create-working','memory.read']),True,True,True)
    if change=='narrow-scope':a=ExchangeAuthority(auth(root='tenant:other'),True,True,True)
    if change=='canonical':a=authority(canonical=False)
    with pytest.raises(PermissionError):import_graph(SqliteGraph(target),raw,a)
    assert not any(counts(target).values())

@pytest.mark.parametrize('change',['checksum','version','model','duplicate-id','dangling','unknown','corrupt-json','duplicate-key','role','cross-scope','invalid-id'])
def test_exchange_prevalidation_atomic_rejection(tmp_path,change):
    source,_=seed(tmp_path/'source.db');raw=export_graph(SqliteGraph(source),authority());b=json.loads(raw)
    if change=='checksum':b['sections']['records'][0]['content']='tampered';raw=encoded(b)
    elif change=='version':b['formatVersion']=99;raw=resign(b)
    elif change=='model':b['modelVersion']=99;raw=resign(b)
    elif change=='duplicate-id':b['sections']['records'].append(b['sections']['records'][0]);raw=resign(b)
    elif change=='dangling':b['sections']['artifacts'][0]['record_id']='rec_missing';raw=resign(b)
    elif change=='unknown':b['sections']['records'][0]['injected']=True;raw=resign(b)
    elif change=='corrupt-json':raw=b'{'
    elif change=='duplicate-key':raw=b'{"format":1,"format":2}'
    elif change=='role':b['sections']['records'][0]['role']='invented';raw=resign(b)
    elif change=='invalid-id':b['sections']['records'][0]['id']='not-a-record-uuid';raw=resign(b)
    elif change=='cross-scope':b['sections']['records'][0]['scope_path']='tenant:other';raw=resign(b)
    target=SqliteStore(Path(tmp_path/'target.db'))
    with pytest.raises((ExchangeError,PermissionError)):import_graph(SqliteGraph(target),raw,authority())
    assert not any(counts(target).values())

def test_interrupted_import_transaction_rolls_back_on_exception_and_process_exit(tmp_path):
    source,_=seed(tmp_path/'source.db');raw=export_graph(SqliteGraph(source),authority())
    target=SqliteStore(Path(tmp_path/'target.db'))
    class FailAfterWrite(SqliteGraph):
        def _insert(self,*args):
            super()._insert(*args)
            raise RuntimeError('fixture interruption after real insert')
    with pytest.raises(RuntimeError):import_graph(FailAfterWrite(target),raw,authority())
    assert not any(counts(target).values())
    artifact=tmp_path/'graph.json';artifact.write_bytes(raw)
    script="""import os,sys
from pathlib import Path
from app.storage import SqliteStore
from app.sqlite_graph import SqliteGraph, TABLES
from app.exchange import import_graph,ExchangeAuthority
from app.domain import AuthContext
from app.settings import _parse_grant
class Crash(SqliteGraph):
 def _insert(self,*args):
  super()._insert(*args)
  os._exit(23)
a=ExchangeAuthority(AuthContext(_parse_grant('offline-exchange', {'actor':'operator:fixture','scope_path':'tenant:offline','permissions':['memory.admin']})),True,True,True)
import_graph(Crash(SqliteStore(Path(sys.argv[1]))),Path(sys.argv[2]).read_bytes(),a)
"""
    p=subprocess.run([sys.executable,'-c',script,str(tmp_path/'target.db'),str(artifact)],cwd=Path(__file__).resolve().parents[1],env={'PATH':'/usr/bin:/bin'},timeout=15)
    assert p.returncode==23
    assert not any(counts(target).values())
    import_graph(SqliteGraph(target),raw,authority());assert export_graph(SqliteGraph(target),authority())==raw
