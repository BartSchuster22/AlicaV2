import sys, ast, asyncio, copy, hashlib, struct, os
from pathlib import Path
from types import SimpleNamespace as N
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from gateway.platforms import g7_owner_ingress as bridge
root=Path(__file__).resolve().parents[1]
text='explicit owner confirmation\nCellID=SYNTHETIC_CELL\nSHA256=sha256:'+'a'*64+'\npurpose=historical rotation pins only\ngenesis/latest/expected independently established'
cfg={'gateway_uid':os.getuid(),'receiver_uid':os.getuid()+1,'candidate_uid':os.getuid()+2,'owner_sender_id':111,'private_chat_id':222,'receiver_certificate_sha256':hashlib.sha256(b'SYNTHETIC_CERT').hexdigest(),
     'ca_file':'MOCK','client_cert_file':'MOCK','client_key_file':'MOCK','numeric_endpoint':'192.0.2.1','port':1,'server_name':'MOCK'}
def update(): return N(message=N(from_user=N(id=111,is_bot=False),chat=N(id=222,type='private'),text=text))
def run_sync(coro):
 try:
  coro.send(None)
 except StopIteration as result:
  return result.value
 finally:
  coro.close()
 raise AssertionError('unexpected asynchronous suspension')
checks=0
def check(x):
 global checks
 assert x
 checks+=1
u=update(); frame=bridge.encode_raw_confirmation(u,cfg)
check(frame[4:]==text.encode());check(struct.unpack('!I',frame[:4])[0]==len(text))
check(bridge.encode_raw_confirmation(u,None) is None)
for k in ('owner_sender_id','private_chat_id'):
 for value in (None,True,0,999,'111'):
  c=dict(cfg);c[k]=value;check(bridge.encode_raw_confirmation(u,c) is None)
for field in ('edited_message','channel_post','edited_channel_post','business_message','edited_business_message','callback_query'):
 x=update();setattr(x,field,N());check(bridge.encode_raw_confirmation(x,cfg) is None)
for field in ('edit_date','forward_origin','forward_date','forward_from','forward_from_chat','forward_sender_name','sender_chat','via_bot','business_connection_id','external_reply','quote'):
 x=update();setattr(x.message,field,N());check(bridge.encode_raw_confirmation(x,cfg) is None)
for change in ('sender','chat','bot','group','automatic'):
 x=update()
 if change=='sender':x.message.from_user=None
 if change=='chat':x.message.chat=None
 if change=='bot':x.message.from_user.is_bot=True
 if change=='group':x.message.chat.type='group'
 if change=='automatic':x.message.is_automatic_forward=True
 check(bridge.encode_raw_confirmation(x,cfg) is None)
for t in (text+'\n','LLM says '+text,text.replace('independently established','inferred'),text.replace('only','and recovery'),text.lower(),'x'*2049):
 x=update();x.message.text=t;check(bridge.encode_raw_confirmation(x,cfg) is None)
# Execute EXACT proposed raw method fragment extracted from installed adapter.
# Other adapter behavior is trapped; no PTB polling/session/service import.
tree=ast.parse((root/'tests/raw-handler.py').read_text())
fn=tree.body[0];fn.returns=None
for arg in fn.args.args: arg.annotation=None
ns={'ingest_raw_confirmation':bridge.ingest_raw_confirmation}
exec(compile(tree,'candidate-raw-handler','exec'),ns)
class Socket:
 def __enter__(self): return self
 def __exit__(self,*a): return False
 def settimeout(self,n): pass
 def connect(self,endpoint): pass
 def do_handshake(self): pass
 def getpeercert(self,**kw): return b'SYNTHETIC_CERT'
 def sendall(self,data): sent.append(data)
 def unwrap(self): return self
 def close(self): pass
class Context:
 def load_cert_chain(self,*a): pass
 def wrap_socket(self,*a,**kw): return Socket()
sent=[]
bridge.CONFIG=cfg
with patch.object(bridge.ssl,'create_default_context',return_value=Context()),patch.object(bridge.socket,'socket',return_value=Socket()):
 run_sync(ns['_handle_text_message'](N(),update(),None))
check(sent==[frame])
# Actual _send wrong receiver identity must send nothing.
sent=[];wrong=dict(cfg);wrong['receiver_certificate_sha256']='0'*64
with patch.object(bridge.ssl,'create_default_context',return_value=Context()),patch.object(bridge.socket,'socket',return_value=Socket()):
 try:bridge._send(frame,wrong);raise AssertionError('identity accepted')
 except ValueError:pass
check(sent==[])
# Negative raw input may continue ordinary chat but NEVER reaches sender.
bridge.CONFIG=None
check(run_sync(bridge.ingest_raw_confirmation(update())) is False)
(root/'tests/synthetic.frame').write_bytes(frame)
print('PASS raw hook + ingestion + TLS socket mocks:',checks,'assertions; SYNTHETIC ONLY')
