"""Offline conformance helper: compare the very same ACAP-created record via native and HTTP."""
from pathlib import Path
import json,os,sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
db,record_id=sys.argv[1:]
grant={'actor':'worker:fixture','scope_path':'tenant:offline','permissions':['memory.read','memory.search']}
os.environ['MEMORYV4_DB_PATH']=db
os.environ['MEMORYV4_API_KEYS']=json.dumps({'offline-parity':grant})
from fastapi.testclient import TestClient
from app.main import create_app
from app.domain import AuthContext,GovernedMemory
from app.settings import _parse_grant
from app.storage import SqliteStore
native=GovernedMemory(SqliteStore(Path(db))).get_record(record_id=record_id,scope_path='tenant:offline/project:a',auth=AuthContext(_parse_grant('offline-parity',grant)))
with TestClient(create_app()) as client:
    response=client.get('/records/'+record_id,params={'scope_path':'tenant:offline/project:a'},headers={'Authorization':'Bearer offline-parity'})
    assert response.status_code==200,response.text
    assert response.json()==native.model_dump(mode='json')
assert native.role.value=='active' and native.lifecycle.value=='working'
print(json.dumps({'id':native.id,'scope':native.scope_path,'role':native.role.value,'lifecycle':native.lifecycle.value,'author':native.author_actor,'content':native.content,'nativeHttpExactEquality':True}))
