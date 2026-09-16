#!/usr/bin/env python3
"""G1 normative design checks only, never a production Kernel/authority engine."""
import base64,copy,hashlib,itertools,json,subprocess,tempfile,unittest
from pathlib import Path
from jsonschema import Draft202012Validator
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization
from cryptography.exceptions import InvalidSignature
import test_specifications as old
R=Path(__file__).resolve().parents[2]
SC=old.SC;EX=old.EX
class RuleError(ValueError):pass
def require(ok,code):
 if not ok:raise RuleError(code)
def unique(values,code):require(len(values)==len(set(values)),code)
def canonical_a(v):return old.canonical(v)
def canonical_b(v):
 """Independent hand encoder; does not call JSON serialization or encoder A."""
 def encode(x,depth=0):
  require(depth<=32,'DEPTH')
  if x is None:return 'null'
  if x is True:return 'true'
  if x is False:return 'false'
  if type(x) is int:
   require(abs(x)<=9007199254740991,'INTEGER_RANGE');return str(x)
  if type(x) is str:
   out=['"'];short={8:'\\b',9:'\\t',10:'\\n',12:'\\f',13:'\\r'}
   for c in x:
    n=ord(c);require(not 0xd800<=n<=0xdfff,'SURROGATE')
    if c=='"':out.append('\\"')
    elif c=='\\':out.append('\\\\')
    elif n in short:out.append(short[n])
    elif n<32:out.append('\\u%04x'%n)
    else:out.append(c)
   return ''.join(out)+'"'
  if type(x) is list:return '['+','.join(encode(v,depth+1) for v in x)+']'
  if type(x) is dict:
   require(all(type(k) is str and all(ord(c)<128 for c in k) for k in x),'KEY')
   return '{'+','.join(encode(k)+':'+encode(x[k],depth+1) for k in sorted(x))+'}'
  raise RuleError('TYPE')
 return encode(v).encode('utf-8')
def payload(s):
 keys={'object':{'properties','required','additionalProperties'},'array':{'items','minItems','maxItems'},'string':{'minLength','maxLength'},'integer':{'minimum','maximum'},'boolean':set(),'null':set()}
 common={'type','enum','const','description'}
 require(set(s)<=common|keys[s['type']],'PAYLOAD_KEYWORD')
 for lo,hi in [('minimum','maximum'),('minItems','maxItems'),('minLength','maxLength')]:
  if lo in s and hi in s:require(s[lo]<=s[hi],'PAYLOAD_INTERVAL')
 if s['type']=='object':
  require(set(s.get('required',[]))<=set(s['properties']),'PAYLOAD_REQUIRED')
  for child in s['properties'].values():payload(child)
 if s['type']=='array':payload(s['items'])
 test={k:v for k,v in s.items() if k not in {'enum','const'}}
 if 'enum' in s:
  unique([canonical_a(v) for v in s['enum']],'PAYLOAD_ENUM_DUPLICATE')
  require(all(Draft202012Validator(test).is_valid(v) for v in s['enum']),'PAYLOAD_ENUM_TYPE')
 if 'const' in s:
  require(Draft202012Validator(test).is_valid(s['const']),'PAYLOAD_CONST_TYPE')
  if 'enum' in s:require(any(canonical_a(s['const'])==canonical_a(v) for v in s['enum']),'PAYLOAD_CONST_ENUM')
def validate(n,x):
 old.walk(x)
 require(Draft202012Validator(SC[n]).is_valid(x),'SCHEMA')
 old.semantic(n,x)
 if 'version' in x and isinstance(x['version'],str):require(all(int(v)<=2147483647 for v in x['version'].split('.')),'VERSION_RANGE')
 if n in {'grant','secret-grant','event-grant','trust-policy','revocation'}:require(x['expiresAtMs']>x['issuedAtMs'],'GRANT_INTERVAL')
 if n=='capability':
  for op in x['operations']:
   payload(op['input']);payload(op['output'])
   require(not(op['kind']=='stream' and op['idempotency']=='provider'),'STREAM_IDEMPOTENCY')
 if n=='event-descriptor':payload(x['payload'])
 if n=='plugin':
  reqs=x['requires']+x['optionalRequires'];unique([r['capabilityId'] for r in reqs],'DEPENDENCY_DUPLICATE')
  unique([(v['capabilityId'],v['version']) for v in x['provides']],'PROVIDES_DUPLICATE')
  for direction in ['publishedEvents','subscribedEvents']:
   unique([v['eventType'] for v in x[direction]],'EVENT_DUPLICATE')
  for r in reqs:
   require(r['minMinor']<=r.get('maxMinor',2147483647),'REQUIREMENT_RANGE')
   require(all(0<=r[k]<=2147483647 for k in ['major','minMinor']+(['maxMinor'] if 'maxMinor' in r else [])),'REQUIREMENT_RANGE')
   require(not set(r['features'])&set(r.get('optionalFeatures',[])),'FEATURE_OVERLAP')
 if n=='profile':
  scopes={s['id']:s['parent'] for s in x['scopes']}
  require(len(scopes)==len(x['scopes']),'SCOPE_DUPLICATE')
  require(sum(p is None for p in scopes.values())==1,'SCOPE_ROOT')
  for start in scopes:
   seen=set();current=start
   while current is not None:
    require(current in scopes,'SCOPE_PARENT');require(current not in seen,'SCOPE_CYCLE');seen.add(current);current=scopes[current]
  require(all(p['providerId'] in {v['id'] for v in x['plugins']} for p in x['providerPins']),'PIN_PROVIDER')
 if n=='resolution-lock':
  plugins={v['id']:v for v in x['plugins']};require(len(plugins)==len(x['plugins']),'LOCK_DUPLICATE_PLUGIN')
  keys=[(b['scope'],b['consumerId'],b['capabilityId']) for b in x['bindings']];unique(keys,'LOCK_DUPLICATE_BINDING')
  require(keys==sorted(keys) and list(plugins)==sorted(plugins),'LOCK_ORDER')
  for b in x['bindings']:
   require(b['providerId'] in plugins and b['consumerId'] in plugins,'LOCK_PLUGIN')
   p=plugins[b['providerId']];require(p['version']==b['providerVersion'] and p['packageDigest']==b['packageDigest'],'LOCK_ARTIFACT')
 if n=='root-rotation':
  require(x['nextVersion']==x['priorVersion']+1,'ROTATION_VERSION')
  require(x['priorKeyId']!=x['nextKeyId'] and x['priorPolicyDigest']!=x['nextPolicyDigest'],'ROTATION_IDENTITY')
 if n=='package-index':
  paths=[v['path'] for v in x['files']];unique(paths,'PACKAGE_DUPLICATE_PATH');require(x['manifestPath'] in paths,'PACKAGE_MANIFEST')

def negotiate(candidates,r,pin=None):
 candidates=[c for c in candidates if c['visible'] and c['trusted']]
 identities={}
 for c in candidates:
  key=(c['id'],c['version'])
  require(key not in identities or identities[key]==c['descriptorDigest'],'CONTRACT_MISMATCH');identities[key]=c['descriptorDigest']
 filtered=[c for c in candidates if old.version(c['version'])[1]<=r.get('maxMinor',2147483647)]
 selected=old.select(filtered,r,pin)
 c=next(v for v in filtered if v['provider']==selected)
 return selected,sorted(set(r['features'])|set(r.get('optionalFeatures',[]))&set(c['features']))

def allowed(g,ctx,now,revision,revoked=False):
 return not revoked and g['principal']==ctx['principal'] and g['instanceId']==ctx['instanceId'] and g['scope']==ctx['scope'] and g['scopeGeneration']==ctx['scopeGeneration'] and g['issuedAtMs']<=now<g['expiresAtMs'] and g['revision']==revision and ctx['operation'] in g['operations']
TRANSITIONS={'DISCOVERED':{'VERIFIED','FAILED'},'VERIFIED':{'RESOLVED','FAILED'},'RESOLVED':{'ACTIVATING','FAILED'},'ACTIVATING':{'ACTIVE','FAILED'},'ACTIVE':{'QUIESCING'},'QUIESCING':{'DISPOSED','FAILED'},'FAILED':set(),'DISPOSED':set()}
def transition(state,target):require(target in TRANSITIONS[state],'ILLEGAL_TRANSITION');return target

def freshness(policy,rev,now,lastversion,lasttime):
 return rev['version']>=lastversion and now>=lasttime and policy['issuedAtMs']<=now<policy['expiresAtMs'] and rev['issuedAtMs']<=now<rev['expiresAtMs'] and now-rev['issuedAtMs']<=policy['maxOfflineAgeMs']

class CompleteSchemas(unittest.TestCase):pass
for n in SC:
 def check(self,n=n):validate(n,copy.deepcopy(EX[n]))
 setattr(CompleteSchemas,'test_semantic_positive_'+n.replace('-','_'),check)
class NegativeSemantic(unittest.TestCase):
 def bad(self,n,change,code):
  x=copy.deepcopy(EX[n]);change(x)
  with self.assertRaisesRegex(ValueError,'^'+code+'$'):validate(n,x)
 def test_required_missing_property(self):self.bad('capability',lambda x:x['operations'][0]['input'].update(required=['absent']),'PAYLOAD_REQUIRED')
 def test_payload_range(self):self.bad('capability',lambda x:x['operations'][0]['input']['properties']['text'].update(minLength=5000),'PAYLOAD_INTERVAL')
 def test_payload_wrong_keyword(self):self.bad('capability',lambda x:x['operations'][0]['input'].update(minLength=1),'PAYLOAD_KEYWORD')
 def test_enum_wrong_type(self):self.bad('capability',lambda x:x['operations'][0]['input']['properties']['text'].update(enum=[1]),'PAYLOAD_ENUM_TYPE')
 def test_enum_duplicate(self):self.bad('capability',lambda x:x['operations'][0]['input']['properties']['text'].update(enum=['x','x']),'PAYLOAD_ENUM_DUPLICATE')
 def test_const_wrong_type(self):self.bad('capability',lambda x:x['operations'][0]['input']['properties']['text'].update(const=1),'PAYLOAD_CONST_TYPE')
 def test_const_enum_mismatch(self):self.bad('capability',lambda x:x['operations'][0]['input']['properties']['text'].update(const='x',enum=['y']),'PAYLOAD_CONST_ENUM')
 def test_version_component_overflow(self):self.bad('capability',lambda x:x.update(version='2147483648.0.0'),'VERSION_RANGE')
 def test_missing_idempotency_policy(self):self.bad('capability',lambda x:x['operations'][0].update(idempotency='provider'),'SCHEMA')
 def test_policy_for_none(self):self.bad('capability',lambda x:x['operations'][0].update(idempotencyPolicy={'retentionMs':1,'persistence':'instance'}),'SCHEMA')
 def test_stream_idempotency(self):self.bad('capability',lambda x:x['operations'][0].update(kind='stream',idempotency='provider',idempotencyPolicy={'retentionMs':1,'persistence':'instance'}),'STREAM_IDEMPOTENCY')
 def test_dependency_duplicates(self):
  def change(x):
   r={'capabilityId':'org.alica.echo','major':1,'minMinor':0,'operations':['echo'],'features':[]};x['requires']=[r];x['optionalRequires']=[r]
  self.bad('plugin',change,'DEPENDENCY_DUPLICATE')
 def test_feature_overlap(self):self.bad('plugin',lambda x:x.update(requires=[{'capabilityId':'org.alica.echo','major':1,'minMinor':0,'operations':['echo'],'features':['a'],'optionalFeatures':['a']}]),'FEATURE_OVERLAP')
 def test_inverted_version_range(self):self.bad('plugin',lambda x:x.update(requires=[{'capabilityId':'org.alica.echo','major':1,'minMinor':2,'maxMinor':1,'operations':['echo'],'features':[]}]),'REQUIREMENT_RANGE')
 def test_secret_wrong_operation(self):self.bad('secret-grant',lambda x:x.update(operations=['write']),'SCHEMA')
 def test_expired_interval(self):self.bad('secret-grant',lambda x:x.update(expiresAtMs=999),'GRANT_INTERVAL')
 def test_event_wrong_operation(self):self.bad('event-grant',lambda x:x.update(operations=['execute']),'SCHEMA')
 def test_empty_capability_operations(self):self.bad('grant',lambda x:x.update(operations=[]),'SCHEMA')
 def test_scope_cycle(self):self.bad('profile',lambda x:x['scopes'].extend([{'id':'a','parent':'b'},{'id':'b','parent':'a'}]),'SCOPE_CYCLE')
 def test_unknown_parent(self):self.bad('profile',lambda x:x['scopes'].append({'id':'a','parent':'missing'}),'SCOPE_PARENT')
 def test_scope_two_roots(self):self.bad('profile',lambda x:x['scopes'].append({'id':'a','parent':None}),'SCOPE_ROOT')
 def test_pin_unknown_provider(self):self.bad('profile',lambda x:x['providerPins'].append({'capabilityId':'org.alica.echo','providerId':'org.alica.absent'}),'PIN_PROVIDER')
 def test_lock_unknown_provider(self):self.bad('resolution-lock',lambda x:x['bindings'][0].update(providerId='org.alica.absent'),'LOCK_PLUGIN')
 def test_lock_wrong_package(self):self.bad('resolution-lock',lambda x:x['bindings'][0].update(packageDigest='sha256:'+'2'*64),'LOCK_ARTIFACT')
 def test_lock_duplicate_binding(self):self.bad('resolution-lock',lambda x:x['bindings'].extend(copy.deepcopy(x['bindings'])),'LOCK_DUPLICATE_BINDING')
 def test_lock_plugin_order(self):self.bad('resolution-lock',lambda x:x['plugins'].reverse(),'LOCK_ORDER')
 def test_rotation_skips_version(self):self.bad('root-rotation',lambda x:x.update(nextVersion=3),'ROTATION_VERSION')
 def test_rotation_same_key(self):self.bad('root-rotation',lambda x:x.update(nextKeyId=x['priorKeyId']),'ROTATION_IDENTITY')
 def test_package_missing_manifest(self):self.bad('package-index',lambda x:x.update(manifestPath='missing.json'),'PACKAGE_MANIFEST')
 def test_package_duplicate_path(self):self.bad('package-index',lambda x:x['files'].extend(copy.deepcopy(x['files'])),'PACKAGE_DUPLICATE_PATH')
 def test_response_both_outcomes(self):self.bad('response',lambda x:x['result'].update(error=EX['error']),'SCHEMA')
 def test_event_duplicate_declaration(self):
  def change(x):
   b={'eventType':'org.alica.observed','version':'1.0.0','descriptorDigest':'sha256:'+'1'*64,'descriptorPath':'observed.json'};x['publishedEvents']=[b,b]
  self.bad('plugin',change,'EVENT_DUPLICATE')
 def test_event_instance_required(self):self.bad('event',lambda x:x.pop('sourceInstanceId'),'SCHEMA')
 def test_event_scope_generation_required(self):self.bad('event',lambda x:x.pop('scopeGeneration'),'SCHEMA')
 def test_event_unknown_metadata(self):self.bad('event',lambda x:x.update(authority='admin'),'SCHEMA')
 def test_event_descriptor_fixture_binding(self):
  self.assertEqual(EX['event']['type'],EX['event-descriptor']['id'])
  self.assertEqual(EX['event']['contractDigest'],'sha256:'+hashlib.sha256(canonical_a(EX['event-descriptor'])).hexdigest())

class Negotiation(unittest.TestCase):
 def setUp(self):
  self.r={'capabilityId':'org.alica.echo','major':1,'minMinor':0,'maxMinor':1,'operations':['echo'],'features':['basic'],'optionalFeatures':['stream','audit']}
  self.a={'id':'org.alica.echo','provider':'org.alica.a','version':'1.1.0','visible':True,'trusted':True,'authorized':True,'operations':['echo'],'features':['basic','audit'],'digest':'a','descriptorDigest':'sha256:'+'1'*64}
 def test_optional_features(self):self.assertEqual(negotiate([self.a],self.r),('org.alica.a',['audit','basic']))
 def test_optional_features_absent(self):self.assertEqual(negotiate([{**self.a,'features':['basic']}],self.r)[1],['basic'])
 def test_max_minor(self):
  with self.assertRaisesRegex(ValueError,'^NO_CANDIDATE$'):negotiate([{**self.a,'version':'1.2.0'}],self.r)
 def test_conflicting_descriptor(self):
  with self.assertRaisesRegex(ValueError,'^CONTRACT_MISMATCH$'):negotiate([self.a,{**self.a,'provider':'org.alica.b','descriptorDigest':'sha256:'+'2'*64}],self.r)
 def test_catalog_permutations(self):
  b={**self.a,'provider':'org.alica.b'}
  for xs in itertools.permutations([self.a,b]):self.assertEqual(negotiate(xs,self.r)[0],'org.alica.a')

class AuthorityLifecycle(unittest.TestCase):
 def setUp(self):
  self.g=copy.deepcopy(EX['grant']);self.ctx={k:self.g[k] for k in ['principal','instanceId','scope','scopeGeneration']};self.ctx['operation']='echo'
 def test_authorized(self):self.assertTrue(allowed(self.g,self.ctx,1500,1))
 def test_changed_principal(self):self.assertFalse(allowed(self.g,{**self.ctx,'principal':'org.alica.attacker'},1500,1))
 def test_changed_instance(self):self.assertFalse(allowed(self.g,{**self.ctx,'instanceId':'new'},1500,1))
 def test_sibling_scope(self):self.assertFalse(allowed(self.g,{**self.ctx,'scope':'sibling'},1500,1))
 def test_reused_scope(self):self.assertFalse(allowed(self.g,{**self.ctx,'scopeGeneration':2},1500,1))
 def test_wrong_operation(self):self.assertFalse(allowed(self.g,{**self.ctx,'operation':'admin'},1500,1))
 def test_expiry_boundary(self):self.assertFalse(allowed(self.g,self.ctx,2000,1))
 def test_future_issuance(self):self.assertFalse(allowed(self.g,self.ctx,999,1))
 def test_revision_revoke(self):self.assertFalse(allowed(self.g,self.ctx,1500,2))
 def test_revoked_flag(self):self.assertFalse(allowed(self.g,self.ctx,1500,1,True))
 def test_every_transition(self):
  for state in TRANSITIONS:
   for target in TRANSITIONS:
    if target in TRANSITIONS[state]:self.assertEqual(transition(state,target),target)
    else:
     with self.assertRaisesRegex(RuleError,'^ILLEGAL_TRANSITION$'):transition(state,target)
 def test_partial_cleanup_keeps_failure(self):
  # Reference model of disposal ordering and aggregation, not a runtime manager.
  attempted=[];errors=[]
  def dispose(n):
   attempted.append(n)
   if n=='b':raise RuntimeError('fixture failure')
  for n in reversed(['a','b','c']):
   try:dispose(n)
   except RuntimeError as e:errors.append(str(e))
  self.assertEqual(attempted,['c','b','a']);self.assertEqual(len(errors),1)
 def test_deadline_inheritance(self):self.assertEqual(min(60000,1500,1000+30000),1500)
 def test_terminal_first_wins(self):
  for outcomes in itertools.permutations(['CANCELLED','DEADLINE_EXCEEDED','success']):
   terminal=None
   for value in outcomes:
    if terminal is None:terminal=value
   self.assertEqual(terminal,outcomes[0])
 def test_offline_fresh(self):self.assertTrue(freshness(EX['trust-policy'],EX['revocation'],1500,1,1200))
 def test_offline_expired(self):self.assertFalse(freshness(EX['trust-policy'],EX['revocation'],2000,1,1200))
 def test_offline_backward_clock(self):self.assertFalse(freshness(EX['trust-policy'],EX['revocation'],1500,1,1600))
 def test_offline_rollback_metadata(self):self.assertFalse(freshness(EX['trust-policy'],EX['revocation'],1500,2,1200))
 def test_offline_old_metadata(self):self.assertFalse(freshness({**EX['trust-policy'],'maxOfflineAgeMs':100},EX['revocation'],1500,1,1200))

class Digests(unittest.TestCase):
 def test_golden_vectors(self):
  data=json.loads((R/'specs/vectors/canonical.json').read_text())
  for v in data['vectors']:
   with self.subTest(v['id']):
    a=canonical_a(v['value']);b=canonical_b(v['value'])
    self.assertEqual(a.hex(),v['canonicalHex']);self.assertEqual(a,b)
    self.assertEqual('sha256:'+hashlib.sha256(a).hexdigest(),v['digest'])
    # Third independent digest implementation (OpenSSL CLI), same canonical bytes.
    r=subprocess.run(['openssl','dgst','-sha256'],input=b,capture_output=True)
    self.assertEqual(r.returncode,0);self.assertEqual(r.stdout.decode().strip().split()[-1],v['digest'][7:])
 def test_reject_duplicates_raw(self):
  with self.assertRaisesRegex(ValueError,'^DUPLICATE_KEY$'):old.decode(b'{"a":1,"a":2}')
 def test_reject_oversize_raw(self):
  with self.assertRaisesRegex(ValueError,'^SIZE$'):old.decode(b' '*1048577)
 def test_both_reject_surrogate(self):
  for encoder in [canonical_a,canonical_b]:
   with self.assertRaisesRegex(ValueError,'^SURROGATE$'):encoder('\ud800')
 def test_both_reject_nonascii_key(self):
  for encoder in [canonical_a,canonical_b]:
   with self.assertRaisesRegex(ValueError,'^KEY$'):encoder({'é':1})

class CryptoVectors(unittest.TestCase):
 def setUp(self):self.old=Ed25519PrivateKey.generate();self.new=Ed25519PrivateKey.generate()
 def test_dual_root_and_openssl(self):
  record=copy.deepcopy(EX['root-rotation'])
  for label,key in [('priorKeyId',self.old),('nextKeyId',self.new)]:record[label]='sha256:'+hashlib.sha256(key.public_key().public_bytes(serialization.Encoding.Raw,serialization.PublicFormat.Raw)).hexdigest()
  validate('root-rotation',record);data=b'ALICA-ROOT-ROTATION-v1\n'+canonical_a(record)
  for key in [self.old,self.new]:
   sig=key.sign(data);key.public_key().verify(sig,data)
   with tempfile.TemporaryDirectory() as td:
    p=Path(td);(p/'pub.pem').write_bytes(key.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo));(p/'data').write_bytes(data);(p/'sig').write_bytes(sig)
    r=subprocess.run(['openssl','pkeyutl','-verify','-pubin','-inkey',str(p/'pub.pem'),'-rawin','-in',str(p/'data'),'-sigfile',str(p/'sig')],capture_output=True)
    self.assertEqual(r.returncode,0,r.stderr)
 def test_tampered_record(self):
  data=canonical_a(EX['root-rotation']);sig=self.old.sign(data)
  with self.assertRaises(InvalidSignature):self.old.public_key().verify(sig,data+b' ')
 def test_wrong_root(self):
  data=canonical_a(EX['root-rotation']);sig=self.old.sign(data)
  with self.assertRaises(InvalidSignature):self.new.public_key().verify(sig,data)
 def test_wrong_domain(self):
  data=canonical_a(EX['root-rotation']);sig=self.old.sign(b'ALICA-BUNDLE-v1\n'+data)
  with self.assertRaises(InvalidSignature):self.old.public_key().verify(sig,b'ALICA-ROOT-ROTATION-v1\n'+data)
 def test_missing_rotation_signature(self):
  def quorum(signatures):require(set(signatures)=={'prior','next'},'ROTATION_SIGNATURES')
  with self.assertRaisesRegex(RuleError,'^ROTATION_SIGNATURES$'):quorum({'prior':b'fixture'})

if __name__=='__main__':unittest.main(verbosity=2)
