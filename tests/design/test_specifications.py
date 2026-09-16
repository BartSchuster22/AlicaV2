#!/usr/bin/env python3
"""SCHEMA/DESIGN checks only. NOT runtime enforcement or IPC conformance."""
import copy,hashlib,itertools,json,sys,unittest
from pathlib import Path
from jsonschema import Draft202012Validator
R=Path(__file__).resolve().parents[2]
def read(p):return json.loads((R/p).read_text())
SC={p.stem.split('.')[0]:json.loads(p.read_text()) for p in (R/'specs/schemas').glob('*.schema.json')}
EX={n:read('specs/examples/'+n+'.valid.json') for n in SC}
def walk(x,depth=0):
 if depth>32:raise ValueError('DEPTH')
 if isinstance(x,bool) or x is None:return
 if isinstance(x,int):
  if abs(x)>9007199254740991:raise ValueError('INTEGER_RANGE')
 elif isinstance(x,str):
  if any(0xd800<=ord(c)<=0xdfff for c in x):raise ValueError('SURROGATE')
 elif isinstance(x,list):
  for v in x:walk(v,depth+1)
 elif isinstance(x,dict):
  for k,v in x.items():
   if not isinstance(k,str) or not k.isascii():raise ValueError('KEY')
   walk(v,depth+1)
 else:raise ValueError('TYPE')
def canonical(x):
 walk(x)
 return json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode('utf-8')
def decode(raw):
 if len(raw)>1048576:raise ValueError('SIZE')
 def pairs(ps):
  d={}
  for k,v in ps:
   if k in d:raise ValueError('DUPLICATE_KEY')
   d[k]=v
  return d
 def invalid(_):raise ValueError('NUMBER')
 x=json.loads(raw.decode('utf-8'),object_pairs_hook=pairs,parse_float=invalid,parse_constant=invalid)
 walk(x);return x

def semantic(n,x):
 # Illustrative cross-field checks which JSON Schema alone cannot express.
 walk(x)
 if n=='capability':
  names=[v['name'] for v in x['operations']]
  if len(names)!=len(set(names)):raise ValueError('DUPLICATE_OPERATION')
 if n=='grant' and x['expiresAtMs']<=x['issuedAtMs']:raise ValueError('GRANT_INTERVAL')
 if n=='error' and x['retryable'] and x['code'] not in ('UNAVAILABLE','RESOURCE_EXHAUSTED'):raise ValueError('RETRY_CODE')
 if n=='bundle':
  paths=[a['path'] for a in x['artifacts']]
  if len(paths)!=len(set(paths)):raise ValueError('DUPLICATE_PATH')
 if n=='signature':
  import base64
  try:b=base64.b64decode(x['signature'],validate=True)
  except Exception:raise ValueError('SIGNATURE_ENCODING')
  if len(b)!=64 or base64.b64encode(b).decode()!=x['signature']:raise ValueError('SIGNATURE_ENCODING')
 if n=='profile':
  ids=[p['id'] for p in x['plugins']]
  if len(ids)!=len(set(ids)):raise ValueError('DUPLICATE_PLUGIN')
  ids=[p['capabilityId'] for p in x['providerPins']]
  if len(ids)!=len(set(ids)):raise ValueError('DUPLICATE_PIN')

def version(s):return tuple(int(n) for n in s.split('.'))
def select(candidates,requirement,pin=None):
 eligible=[c for c in candidates if c['id']==requirement['capabilityId'] and c['visible'] and c['authorized'] and c['trusted'] and version(c['version'])[0]==requirement['major'] and version(c['version'])[1]>=requirement['minMinor'] and set(requirement['operations'])<=set(c['operations']) and set(requirement['features'])<=set(c['features'])]
 if pin is not None:eligible=[c for c in eligible if c['provider']==pin]
 if not eligible:raise ValueError('NO_CANDIDATE')
 return sorted(eligible,key=lambda c:(tuple(-v for v in version(c['version'])),c['provider'],c['digest']))[0]['provider']

class SchemaTests(unittest.TestCase):
 pass
for n in SC:
 def valid(self,n=n):
  Draft202012Validator.check_schema(SC[n]);Draft202012Validator(SC[n]).validate(EX[n]);semantic(n,EX[n])
 setattr(SchemaTests,'test_valid_'+n.replace('-','_'),valid)
 def unknown(self,n=n):
  x=copy.deepcopy(EX[n]);x['unexpected']=True
  errors=list(Draft202012Validator(SC[n]).iter_errors(x))
  self.assertTrue(any(e.validator=='additionalProperties' for e in errors))
 setattr(SchemaTests,'test_unknown_field_'+n.replace('-','_'),unknown)
 def missing(self,n=n):
  x=copy.deepcopy(EX[n]);x.pop(SC[n]['required'][0])
  self.assertTrue(any(e.validator=='required' for e in Draft202012Validator(SC[n]).iter_errors(x)))
 setattr(SchemaTests,'test_missing_field_'+n.replace('-','_'),missing)

class NegativeTests(unittest.TestCase):
 def reject(self,n,key,value,validator):
  x=copy.deepcopy(EX[n]);x[key]=value
  self.assertTrue(any(e.validator==validator for e in Draft202012Validator(SC[n]).iter_errors(x)))
 def test_path_traversal(self):self.reject('plugin','entrypoint','../x.js','pattern')
 def test_absolute_path(self):self.reject('plugin','entrypoint','/x.js','pattern')
 def test_backslash_path(self):self.reject('plugin','entrypoint','x\\y.js','pattern')
 def test_prerelease(self):self.reject('capability','version','1.0.0-beta','pattern')
 def test_leading_zero_version(self):self.reject('capability','version','01.0.0','pattern')
 def test_unknown_mode(self):self.reject('plugin','execution','root','enum')
 def test_secret_value_in_profile(self):
  x=copy.deepcopy(EX['profile']);x['secret']='never-allowed'
  self.assertTrue(any(e.validator=='additionalProperties' for e in Draft202012Validator(SC['profile']).iter_errors(x)))
 def test_duplicate_features(self):self.reject('capability','features',['foo','foo'],'uniqueItems')
 def test_remote_schema(self):
  x=copy.deepcopy(EX['capability']);x['operations'][0]['input']['$ref']='https://example.invalid/schema'
  self.assertTrue(any(e.validator=='additionalProperties' for e in Draft202012Validator(SC['capability']).iter_errors(x)))
 def test_duplicate_operation(self):
  x=copy.deepcopy(EX['capability']);x['operations']*=2
  with self.assertRaisesRegex(ValueError,'^DUPLICATE_OPERATION$'):semantic('capability',x)
 def test_bad_grant_interval(self):
  x=copy.deepcopy(EX['grant']);x['expiresAtMs']=x['issuedAtMs']
  with self.assertRaisesRegex(ValueError,'^GRANT_INTERVAL$'):semantic('grant',x)
 def test_retry_denial(self):
  x=copy.deepcopy(EX['error']);x['retryable']=True
  with self.assertRaisesRegex(ValueError,'^RETRY_CODE$'):semantic('error',x)
 def test_duplicate_bundle_path(self):
  x=copy.deepcopy(EX['bundle']);x['artifacts']*=2
  with self.assertRaisesRegex(ValueError,'^DUPLICATE_PATH$'):semantic('bundle',x)
 def test_duplicate_profile_plugin(self):
  x=copy.deepcopy(EX['profile']);x['plugins']*=2
  with self.assertRaisesRegex(ValueError,'^DUPLICATE_PLUGIN$'):semantic('profile',x)

class CanonicalTests(unittest.TestCase):
 def test_fixed_bytes(self):self.assertEqual(canonical({'z':1,'a':'é\n'}),b'{"a":"\xc3\xa9\\n","z":1}')
 def test_key_order(self):self.assertEqual(canonical({'b':2,'a':1}),canonical({'a':1,'b':2}))
 def test_descriptor_digest(self):self.assertEqual('sha256:'+hashlib.sha256(canonical(EX['capability'])).hexdigest(),EX['plugin']['provides'][0]['descriptorDigest'])
 def test_duplicate_keys(self):
  with self.assertRaisesRegex(ValueError,'^DUPLICATE_KEY$'):decode(b'{"a":1,"a":2}')
 def test_float(self):
  with self.assertRaisesRegex(ValueError,'^NUMBER$'):decode(b'{"a":1.5}')
 def test_exponent(self):
  with self.assertRaisesRegex(ValueError,'^NUMBER$'):decode(b'1e2')
 def test_nan(self):
  with self.assertRaisesRegex(ValueError,'^NUMBER$'):decode(b'NaN')
 def test_range(self):
  with self.assertRaisesRegex(ValueError,'^INTEGER_RANGE$'):canonical(9007199254740992)
 def test_surrogate(self):
  with self.assertRaisesRegex(ValueError,'^SURROGATE$'):decode(b'"\\ud800"')
 def test_nonascii_key(self):
  with self.assertRaisesRegex(ValueError,'^KEY$'):canonical({'é':1})
 def test_depth(self):
  x=0
  for _ in range(33):x=[x]
  with self.assertRaisesRegex(ValueError,'^DEPTH$'):canonical(x)
 def test_size(self):
  with self.assertRaisesRegex(ValueError,'^SIZE$'):decode(b' '*1048577)
 def test_bool_not_integer(self):self.assertEqual(canonical(True),b'true')
 def test_negative_zero(self):self.assertEqual(canonical(decode(b'-0')),b'0')

class DesignExamples(unittest.TestCase):
 def setUp(self):
  self.req={'capabilityId':'org.alica.echo','major':1,'minMinor':0,'operations':['echo'],'features':[]}
  self.a={'id':'org.alica.echo','provider':'org.alica.a','version':'1.0.0','visible':True,'authorized':True,'trusted':True,'operations':['echo'],'features':[],'digest':'a'}
  self.b={**self.a,'provider':'org.alica.b'}
 def test_shuffle_resolution(self):
  for catalog in itertools.permutations([self.a,self.b]):self.assertEqual(select(catalog,self.req),'org.alica.a')
 def test_numeric_version(self):self.assertEqual(select([{**self.a,'version':'1.9.0'},{**self.b,'version':'1.10.0'}],self.req),'org.alica.b')
 def test_pin(self):self.assertEqual(select([self.a,self.b],self.req,'org.alica.b'),'org.alica.b')
 def test_missing_pin_no_fallback(self):
  with self.assertRaisesRegex(ValueError,'^NO_CANDIDATE$'):select([self.a],self.req,'org.alica.b')
 def test_wrong_major(self):
  with self.assertRaisesRegex(ValueError,'^NO_CANDIDATE$'):select([{**self.a,'version':'2.0.0'}],self.req)
 def test_missing_feature(self):
  with self.assertRaisesRegex(ValueError,'^NO_CANDIDATE$'):select([self.a],{**self.req,'features':['stream']})
 def test_denied_grant(self):
  with self.assertRaisesRegex(ValueError,'^NO_CANDIDATE$'):select([{**self.a,'authorized':False}],self.req)
 def test_invisible_provider(self):
  with self.assertRaisesRegex(ValueError,'^NO_CANDIDATE$'):select([{**self.a,'visible':False}],self.req)
 def test_untrusted_provider(self):
  with self.assertRaisesRegex(ValueError,'^NO_CANDIDATE$'):select([{**self.a,'trusted':False}],self.req)
 def test_missing_operation(self):
  with self.assertRaisesRegex(ValueError,'^NO_CANDIDATE$'):select([{**self.a,'operations':[]}],self.req)

class ScopeLifecycleExamples(unittest.TestCase):
 def setUp(self):
  self.parents={'root':None,'left':'root','right':'root','leaf':'left'}
 def visible(self,registration,consumer):
  while consumer is not None:
   if consumer==registration:return True
   consumer=self.parents[consumer]
  return False
 def test_ancestor_visible(self):self.assertTrue(self.visible('root','leaf'))
 def test_sibling_hidden(self):self.assertFalse(self.visible('left','right'))
 def test_child_hidden_from_parent(self):self.assertFalse(self.visible('leaf','left'))
 def test_scope_self_visible(self):self.assertTrue(self.visible('left','left'))
 def test_grant_intersection(self):self.assertEqual({'echo','admin'} & {'echo'}, {'echo'})
 def test_grant_expiry_boundary(self):
  g=EX['grant']
  self.assertTrue(g['issuedAtMs']<=1999<g['expiresAtMs'])
  self.assertFalse(g['issuedAtMs']<=2000<g['expiresAtMs'])
 def test_revoked_revision(self):self.assertNotEqual(EX['grant']['revision'],EX['grant']['revision']+1)
 def test_stale_generation(self):self.assertNotEqual(('scope',1),('scope',2))
 def test_reverse_disposal_order(self):self.assertEqual(list(reversed(['a','b','c'])),['c','b','a'])
 def test_activation_staging(self):
  # Illustrates atomic visibility only; does NOT implement a lifecycle manager.
  published=[];staged=['a','b'];activation_success=False
  if activation_success:published.extend(staged)
  staged.clear();self.assertEqual(published,[])
 def test_terminal_state(self):
  transitions={'DISCOVERED':{'VERIFIED','FAILED'},'VERIFIED':{'RESOLVED','FAILED'},'RESOLVED':{'ACTIVATING','FAILED'},'ACTIVATING':{'ACTIVE','FAILED'},'ACTIVE':{'QUIESCING'},'QUIESCING':{'DISPOSED','FAILED'},'DISPOSED':set(),'FAILED':set()}
  self.assertNotIn('ACTIVE',transitions['DISCOVERED']);self.assertFalse(transitions['DISPOSED']);self.assertFalse(transitions['FAILED'])
 def test_call_cannot_assert_authority(self):
  x=copy.deepcopy(EX['call']);x['principal']='org.alica.admin'
  self.assertTrue(any(e.validator=='additionalProperties' for e in Draft202012Validator(SC['call']).iter_errors(x)))
 def test_bad_signature_padding(self):
  x=copy.deepcopy(EX['signature']);x['signature']='A'*85+'B=='
  with self.assertRaisesRegex(ValueError,'^SIGNATURE_ENCODING$'):semantic('signature',x)

if __name__=='__main__':unittest.main(verbosity=2)
