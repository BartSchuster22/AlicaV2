import sys, asyncio, hashlib, importlib.util, os
from pathlib import Path
from types import SimpleNamespace as N
from unittest.mock import patch
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root))
from gateway.platforms import g7_owner_ingress as repaired
original=len(sys.argv)>1 and sys.argv[1]=='original'
if original:
 spec=importlib.util.spec_from_file_location('gateway.platforms.original',root.parent/'gateway/platforms/g7_owner_ingress.py')
 bridge=importlib.util.module_from_spec(spec);spec.loader.exec_module(bridge)
else: bridge=repaired
cfg={'numeric_endpoint':'192.0.2.1','host':'MOCK','port':1234,'server_name':'synthetic.invalid','receiver_certificate_sha256':hashlib.sha256(b'CERT').hexdigest(),'ca_file':'MOCK','client_cert_file':'MOCK','client_key_file':'MOCK','gateway_uid':os.getuid(),'receiver_uid':os.getuid()+1,'candidate_uid':os.getuid()+2,'owner_sender_id':111,'private_chat_id':222}
frame=(root/'tests/synthetic.frame').read_bytes()
now=0;costs={};trace=[];sockets=[];error_phase=None
class Socket:
 def __init__(self,*a): self.timeout=2;self.closed=False;sockets.append(self)
 def __enter__(self):return self
 def __exit__(self,*a):self.close()
 def settimeout(self,n):assert 0<n<=2;self.timeout=n;trace.append(('timeout',n))
 def phase(self,name):
  global now
  trace.append(name)
  if name==error_phase:raise OSError('synthetic error')
  duration=costs.get(name,0)
  if duration>=self.timeout:
   now+=self.timeout;raise TimeoutError('synthetic socket deadline')
  now+=duration
 def connect(self,address):assert address==('192.0.2.1',1234);self.phase('connect')
 def do_handshake(self):self.phase('tls')
 def getpeercert(self,**kw):return b'CERT'
 def sendall(self,data):assert data==frame;self.phase('write')
 def unwrap(self):self.phase('shutdown');return self
 def close(self):self.closed=True
class Context:
 def load_cert_chain(self,*a):pass
 def wrap_socket(self,raw,**kw):
  assert kw['server_hostname']=='synthetic.invalid'
  if kw.get('do_handshake_on_connect',True):raw.do_handshake()
  return raw
ctx=Context()
def create_connection(*a,**kw):
 s=Socket();s.settimeout(kw['timeout']);s.phase('connect');return s
def run(values,config=None,phase=None):
 global now,costs,trace,sockets,error_phase
 now=0;costs=values;trace=[];sockets=[];error_phase=phase
 with patch.object(repaired.time,'monotonic',side_effect=lambda:now),patch.object(bridge.ssl,'create_default_context',return_value=ctx),patch.object(bridge.socket,'socket',side_effect=Socket),patch.object(bridge.socket,'create_connection',side_effect=create_connection),patch.object(bridge.socket,'getaddrinfo',side_effect=AssertionError('DNS forbidden')):
  try:bridge._send(frame,config or cfg);return None
  except (TimeoutError,OSError,ValueError,KeyError) as e:return type(e)
# Same cumulative repro against both versions: original per-op timeouts allow 2.4s.
assert run(dict.fromkeys(['connect','tls','write','shutdown'],0.6)) is TimeoutError,'cumulative deadline missing'
assert now<=2;assert all(s.closed for s in sockets)
cases=1
for phase in ['connect','tls','write','shutdown']:
 assert run({phase:2.1}) is TimeoutError
 assert all(s.closed for s in sockets);assert now<=2;cases+=1
for duration in [0.499,0.5]:
 result=run(dict.fromkeys(['connect','tls','write','shutdown'],duration))
 assert (result is None)==(duration<0.5);assert all(s.closed for s in sockets);cases+=1
for phase in ['connect','tls','write','shutdown']:
 assert run({},phase=phase) is OSError;assert all(s.closed for s in sockets);cases+=1
bad=dict(cfg,numeric_endpoint='must-not-resolve.invalid');assert run({},bad) is ValueError;assert not sockets;cases+=1
bad=dict(cfg);del bad['numeric_endpoint'];assert run({},bad) is KeyError;assert not sockets;cases+=1
bad=dict(cfg,receiver_certificate_sha256='0'*64);assert run({},bad) is ValueError;assert 'write' not in trace;assert all(s.closed for s in sockets);cases+=1
# Cancellation/error and BUSY paths require no thread/process/real socket.
u=N(message=N(from_user=N(id=111,is_bot=False),chat=N(id=222,type='private'),text=frame[4:].decode()))
bridge.CONFIG=cfg
async def admission():
 for exc in [OSError('error'),asyncio.CancelledError()]:
  with patch.object(bridge,'_send',side_effect=exc):
   try:await bridge.ingest_raw_confirmation(u)
   except asyncio.CancelledError:pass
   assert bridge._BUSY is False
 bridge._BUSY=True
 with patch.object(bridge,'_send',side_effect=AssertionError('overlapping delivery')):
  assert await bridge.ingest_raw_confirmation(u) is True
 bridge._BUSY=False
def run_sync(coro):
 try:
  coro.send(None)
 except StopIteration as result:
  return result.value
 finally:
  coro.close()
 raise AssertionError('unexpected asynchronous suspension')
run_sync(admission());cases+=3
assert not any(word in (root/'gateway/platforms/g7_owner_ingress.py').read_text() for word in ['to_thread(', 'create_task(', 'create_connection('])
print('PASS gateway total deadline:',cases,'deterministic synthetic cases; DNS trapped, no helpers/network/sleeps')
