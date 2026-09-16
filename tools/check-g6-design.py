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
for direction in ['toBroker','toProvider','controlToBroker','controlToProvider','workToBroker','workToProvider']:
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
out=copy.deepcopy(examples['request']);out['body']={'kind':'outbound','wireId':1,'handleId':'h1','requestedMs':1000,'call':copy.deepcopy(examples['request']['body']['call'])}
check('outbound-shape',out,True,'toBroker');forged=copy.deepcopy(out);forged['body']['caller']=examples['request']['body']['caller'];check('outbound-rejects-caller-assertion',forged,False,'toBroker')
for key,val in [('contextId',''),('sessionId','short'),('generation',0),('sequence',-1),('schemaVersion','acap.ipc/v2'),('tag','unknown')]:
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
controls=[{'kind':'context-ready','wireId':11,'offerId':'f'*64,'readyContextId':'ctx1'},{'kind':'task-open','wireId':12,'scopeId':'s1','requestedMs':1000},{'kind':'event-ack','wireId':10,'subscriptionId':'sub1','eventId':'event1'},{'kind':'bind','wireId':2,'scopeId':'s1','requirementIndex':0,'optional':True},{'kind':'register','wireId':3,'scopeId':'s1','capabilityId':'org.example.echo','descriptorDigest':'sha256:'+'a'*64},{'kind':'withdraw','wireId':4,'registrationId':'reg1'},{'kind':'secret','wireId':5,'scopeId':'s1','reference':'synthetic_token'},{'kind':'subscribe','wireId':6,'scopeId':'s1','eventType':'org.example.changed','descriptorDigest':'sha256:'+'a'*64},{'kind':'unsubscribe','wireId':7,'subscriptionId':'sub1'},{'kind':'scope-create','wireId':8,'parentScopeId':'s1'},{'kind':'log','wireId':9,'record':{'level':'info','event':'checkpoint'}}]
for body in controls:
 value=copy.deepcopy(examples['request']);value['body']=body;check('control-'+body['kind'],value,True,'toBroker');check('control-not-from-broker-'+body['kind'],value,False,'toProvider')
# Correctly-shaped false identities/digests intentionally remain schema-valid.
# Native authentication and broker matching MUST reject these in future runtime tests.
wrong=copy.deepcopy(examples['hello']);wrong['body']['packageDigest']='sha256:'+'f'*64;check('valid-digest-shape-does-not-authenticate',wrong,True,'toBroker')
wrong=copy.deepcopy(examples['hello']);wrong['body']['providerId']='org.forged.provider';check('valid-name-shape-does-not-authenticate',wrong,True,'toBroker')
check('invoke-on-work-lane',examples['request'],True,'workToProvider')
check('invoke-not-on-control-lane',examples['request'],False,'controlToProvider')
check('hello-on-control-lane',examples['hello'],True,'controlToBroker')
check('hello-not-on-work-lane',examples['hello'],False,'workToBroker')
for kind in ['context-ready','task-open']:
 body=next(x for x in controls if x['kind']==kind)
 v=copy.deepcopy(examples['request']);v['body']=body;v['contextId']='control'
 check(kind+'-control-lane',v,True,'controlToBroker')
 check(kind+'-not-work-lane',v,False,'workToBroker')
wronglane=copy.deepcopy(out);wronglane['contextId']='control'
check('outbound-cannot-use-control-channel',wronglane,False,'controlToBroker')
check('outbound-work-channel',out,True,'workToBroker')
for tag,field in [('hello','requiredFeatures'),('accepted','negotiatedFeatures')]:
 bad=copy.deepcopy(examples[tag]);bad['body'][field]=[v for v in bad['body'][field] if v!='wire.contexts'];check('required-context-feature-'+tag,bad,False)
 bad=copy.deepcopy(examples[tag]);del bad['body']['events'];check('event-digests-required-'+tag,bad,False)
# R2 endpoint binding remains a runtime/model check, never a header authentication claim.
for key,value in [('parentWireId',2),('caller',examples['request']['body']['caller'])]:
 forged=copy.deepcopy(out);forged['body'][key]=value;check('r2-reject-asserted-'+key,forged,False,'toBroker')
missing=copy.deepcopy(out);del missing['contextId'];check('context-required',missing,False)
limits=copy.deepcopy(examples['accepted']);limits['body']['limits']['maxActiveInboundCalls']=1
check('single-active-is-not-r2',limits,False,'toProvider')
offer=json.loads((D/'context-offer.schema.json').read_text());sample=json.loads((D/'context-offer.example.json').read_text())
Draft202012Validator.check_schema(offer);ov=Draft202012Validator(offer)
def offercheck(label,value,expected):
 actual=ov.is_valid(value);assert actual==expected,label
 results.append({'case':label,'passed':True,'expectedValid':expected,'direction':'broker-native-carrier'})
offercheck('offer-shape',sample,True)
for key,value in [('descriptorCount',0),('descriptorCount',2),('generation',0),('contextId',''),('purpose','arbitrary'),('parentWireId',1),('fd',12),('caller',{})]:
 bad=copy.deepcopy(sample);bad[key]=value;offercheck('offer-reject-'+key+'-'+str(value),bad,False)
for key in sample:
 bad=copy.deepcopy(sample);del bad[key];offercheck('offer-requires-'+key,bad,False)
print(json.dumps({'level':'SCHEMA-DESIGN-ONLY','schemaChecksPassed':len(results),'runtimeQualification':False,'cases':results},indent=2))
