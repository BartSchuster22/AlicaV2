"""Validate proposed G6 frame shapes. This is NOT IPC/runtime qualification."""
from pathlib import Path
import copy,json,sys
R=Path(__file__).resolve().parents[1];sys.path.insert(0,str(R/'.tools/python'))
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
D=R/'docs/g6/draft';schema=json.loads((D/'frames.schema.json').read_text());examples=json.loads((D/'examples.json').read_text())
resources=[json.loads(p.read_text()) for p in (R/'specs/schemas').glob('*.json')]+[schema]
registry=Registry().with_resources((s['$id'],Resource.from_contents(s)) for s in resources)
Draft202012Validator.check_schema(schema)
validators={None:Draft202012Validator(schema,registry=registry)}
for direction in ['toBroker','toProvider']:
 validators[direction]=Draft202012Validator({**schema,'$ref':'#/$defs/'+direction},registry=registry)
results=[]
def check(label,value,expected=True,direction=None):
 errors=list(validators[direction].iter_errors(value));actual=not errors
 if actual!=expected:raise AssertionError(label+': '+str([e.message for e in errors])[:1200])
 results.append({'case':label,'passed':True,'expectedValid':expected,'direction':direction})
for tag,value in examples.items():
 check('valid-'+tag,value)
 for level in ['envelope','body']:
  bad=copy.deepcopy(value);target=bad if level=='envelope' else bad['body'];target['unexpectedAuthority']=True
  check('closed-'+tag+'-'+level,bad,False)
 bad=copy.deepcopy(value);del bad['generation'];check('generation-required-'+tag,bad,False)
check('hello-from-provider',examples['hello'],True,'toBroker');check('hello-not-from-broker',examples['hello'],False,'toProvider')
check('accepted-from-broker',examples['accepted'],True,'toProvider');check('accepted-not-from-provider',examples['accepted'],False,'toBroker')
check('broker-invoke',examples['request'],True,'toProvider');check('provider-cannot-send-broker-invoke',examples['request'],False,'toBroker')
out=copy.deepcopy(examples['request']);out['body']={'kind':'outbound','wireId':1,'handleId':'h1','parentWireId':1,'call':copy.deepcopy(examples['request']['body']['call'])}
check('outbound-shape',out,True,'toBroker');forged=copy.deepcopy(out);forged['body']['caller']=examples['request']['body']['caller'];check('outbound-rejects-caller-assertion',forged,False,'toBroker')
for key,val in [('sessionId','short'),('generation',0),('sequence',-1),('schemaVersion','acap.ipc/v2'),('tag','unknown')]:
 bad=copy.deepcopy(examples['ping']);bad[key]=val;check('invalid-header-'+key,bad,False)
for val in [0,257,1.5]:
 bad=copy.deepcopy(examples['stream-credit']);bad['body']['items']=val;check('credit-shape-'+str(val),bad,False)
for key,val in [('protocolMajor',2),('packageDigest','wrong-digest'),('challenge','short')]:
 bad=copy.deepcopy(examples['hello']);bad['body'][key]=val;check('handshake-shape-'+key,bad,False)
for val in [1.5,9007199254740992,{'bad':'\ud800'}]:
 bad=copy.deepcopy(examples['stream-item']);bad['body']['value']=val;check('reject-non-acap-value-'+str(len(results)),bad,False)
for val in [{'__proto__':{'constructor':'ordinary JSON data'}},'Unicode ✓ 😀',None,False,-9007199254740991]:
 good=copy.deepcopy(examples['stream-item']);good['body']['value']=val;check('accept-acap-value-'+str(len(results)),good)
# Validate every supported control shape, not merely one request per tag.
controls=[{'kind':'event-ack','wireId':10,'subscriptionId':'sub1','eventId':'event1'},{'kind':'bind','wireId':2,'scopeId':'s1','requirementIndex':0,'optional':True},{'kind':'register','wireId':3,'scopeId':'s1','capabilityId':'org.example.echo','descriptorDigest':'sha256:'+'a'*64},{'kind':'withdraw','wireId':4,'registrationId':'reg1'},{'kind':'secret','wireId':5,'scopeId':'s1','reference':'synthetic_token'},{'kind':'subscribe','wireId':6,'scopeId':'s1','eventType':'org.example.changed','descriptorDigest':'sha256:'+'a'*64},{'kind':'unsubscribe','wireId':7,'subscriptionId':'sub1'},{'kind':'scope-create','wireId':8,'parentScopeId':'s1'},{'kind':'log','wireId':9,'record':{'level':'info','event':'checkpoint'}}]
for body in controls:
 value=copy.deepcopy(examples['request']);value['body']=body;check('control-'+body['kind'],value,True,'toBroker');check('control-not-from-broker-'+body['kind'],value,False,'toProvider')
# Correctly-shaped false identities/digests intentionally remain schema-valid.
# Native authentication and broker matching MUST reject these in future runtime tests.
wrong=copy.deepcopy(examples['hello']);wrong['body']['packageDigest']='sha256:'+'f'*64;check('valid-digest-shape-does-not-authenticate',wrong,True,'toBroker')
wrong=copy.deepcopy(examples['hello']);wrong['body']['providerId']='org.forged.provider';check('valid-name-shape-does-not-authenticate',wrong,True,'toBroker')
print(json.dumps({'level':'SCHEMA-DESIGN-ONLY','schemaChecksPassed':len(results),'runtimeQualification':False,'cases':results},indent=2))
