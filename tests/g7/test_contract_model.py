#!/usr/bin/python3
"""Draft contract/model tests. No install, process-reap, or crash durability evidence."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('model', ROOT / 'tools/g7-contract-model.py')
assert spec and spec.loader
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
SCHEMA = m.schema()
V = Draft202012Validator(SCHEMA)
D = 'sha256:' + '1' * 64
R = {k: D for k in ['bundleDigest', 'profileDigest', 'lockDigest', 'policyDigest', 'authorizationDigest']}
F = {'rootKeyId': D, 'policyVersion': 1, 'revocationVersion': 1, 'lastWallMs': 1000}
A = {'schemaVersion': 'alica.cell-accepted/v1', 'cellId': 'cell-test', 'transactionId': 'tx-test', 'sequence': 1, 'release': R, 'trustFloor': F}

def chain(states):
    rows = []
    for i, state in enumerate(states):
        record = {'schemaVersion': 'alica.cell-journal/v1', 'cellId': 'cell-test', 'transactionId': 'tx-test', 'sequence': i+1, 'priorRevision': 0, 'targetRevision': 1, 'operation': 'install', 'state': state, 'prior': None, 'target': copy.deepcopy(R), 'trustFloor': copy.deepcopy(F), 'previousHash': rows[-1]['checksum'] if rows else None, 'outcome': 'OK' if state=='COMMITTED' else 'CRASH_RECONCILIATION' if state in ['RECOVERING','ABORTED','NEEDS_OPERATOR'] else 'PENDING'}
        record['trustFloor']['lastWallMs'] += i
        rows.append(m.envelope(record))
    return rows

FIXTURES = [A, chain(['STAGING'])[0], {'schemaVersion':'alica.cell-authorization/v1','profileDigest':D,'capabilities':[{'principal':'org.test.consumer','scope':'root','capabilityId':'org.test.echo','operations':['echo'],'lifetimeMs':30000}],'secrets':[],'events':[]}, {'schemaVersion':'alica.cell-admin-request/v1','requestId':'req-test','incarnation':'inc-test','expectedSequence':0,'operation':'status'}, {'schemaVersion':'alica.cell-admin-response/v1','requestId':'req-test','incarnation':'inc-test','sequence':1,'status':'STOPPED','code':'OK','acceptedDigest':D}, {'schemaVersion':'alica.cell-backup/v1','backupId':'backup-test','cellId':'cell-test','createdAtMs':1000,'accepted':A,'trustFloor':F,'recoveryKeyId':D,'format':'age-encryption.org/v1','files':[{'path':'state/identity.json','digest':D,'bytes':12}]}, {'schemaVersion':'alica.cell-recovery-approval/v1','cellId':'cell-test','backupCipherDigest':D,'approvedAtMs':1000,'minimumFloor':F,'authorizationDigest':D,'sourceStopped':True}]

class Contracts(unittest.TestCase):
    def test_schema_and_generated_files_match(self):
        Draft202012Validator.check_schema(SCHEMA)
        self.assertEqual(json.loads((m.DRAFT/'contracts.schema.json').read_text()),SCHEMA)
        self.assertEqual(json.loads((m.DRAFT/'limits.json').read_text()),m.LIMITS)

    def test_admin_v2_clone_and_pairs(self):
        request = copy.deepcopy(SCHEMA['$defs']['adminRequest'])
        request['properties']['schemaVersion']['const'] = 'alica.cell-admin-request/v2'
        self.assertEqual(request, SCHEMA['$defs']['adminRequestV2'])
        base = dict(FIXTURES[4], schemaVersion='alica.cell-admin-response/v2')
        for sequence, digest_value in [(0, None), (1, D), (m.MAX, D), (None, None)]:
            value = dict(base, sequence=sequence, acceptedDigest=digest_value)
            if sequence is None: value.update(status='NEEDS_OPERATOR', code='CLEANUP_UNCERTAIN')
            V.validate(value)
            for key in value:
                missing = dict(value); del missing[key]
                self.assertFalse(V.is_valid(missing), key)
            self.assertFalse(V.is_valid(dict(value, extra=True)))
        for sequence, digest_value in [(None, D), (0, D), (1, None), (-1, D), (m.MAX+1, D), (1.5, D), (True, D)]:
            self.assertFalse(V.is_valid(dict(base, sequence=sequence, acceptedDigest=digest_value)))
        for status in ['STOPPED', 'RUNNING', 'FAILED']:
            self.assertFalse(V.is_valid(dict(base, sequence=None, acceptedDigest=None, status=status, code='CLEANUP_UNCERTAIN')))
        for code in ['OK', 'CONFLICT', 'DENIED', 'INVALID', 'TIMEOUT']:
            self.assertFalse(V.is_valid(dict(base, sequence=None, acceptedDigest=None, status='NEEDS_OPERATOR', code=code)))
        self.assertFalse(V.is_valid(dict(FIXTURES[4], sequence=None, acceptedDigest=None)))
        self.assertFalse(V.is_valid(dict(FIXTURES[4], selectionKnown=False)))

    def test_real_admin_parser_bounds_and_endpoint_validation(self):
        spec = importlib.util.spec_from_file_location('admin_server', ROOT / 'tools/g7-supervisor.py')
        assert spec and spec.loader
        server = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(server)
        for version in [1, 2]:
            request = dict(FIXTURES[3], schemaVersion=f'alica.cell-admin-request/v{version}')
            self.assertTrue(server.request_valid(server.decode(json.dumps(request).encode()), version))
            self.assertFalse(server.request_valid(request, 3-version))
            for sequence in [0, m.MAX]:
                self.assertTrue(server.request_valid(dict(request, expectedSequence=sequence), version))
            for sequence in [-1, m.MAX+1, True, None, 1.5]:
                self.assertFalse(server.request_valid(dict(request, expectedSequence=sequence), version))
        self.assertEqual(server.decode(('['*32+'0'+']'*32).encode()), json.loads('['*32+'0'+']'*32))
        self.assertEqual(server.decode('"é"'.encode()), 'é')
        self.assertEqual(server.decode(b'1e0'), 1)
        self.assertEqual(server.decode(str(m.MAX).encode()), m.MAX)
        for body in [b'{"a":1,"a":2}', ('['*33+'0'+']'*33).encode(), b'"\\ud800"', bytes([255]), b'1.0000000000000001', b'1e999999999', b'9007199254740992', b'NaN', b'Infinity', b'{}{}']:
            with self.assertRaises((ValueError, UnicodeError), msg=repr(body)):
                server.decode(body)

    def test_all_objects_closed(self):
        def walk(v):
            if isinstance(v,dict):
                if v.get('type')=='object':
                    self.assertIs(v.get('additionalProperties'),False)
                    self.assertEqual(set(v['required']),set(v['properties']))
                for x in v.values(): walk(x)
            elif isinstance(v,list):
                for x in v:walk(x)
        walk(SCHEMA)

    def test_unknown_nested_authority_is_rejected(self):
        x=copy.deepcopy(FIXTURES[2]);x['capabilities'][0]['instanceId']='reuse-old-authority'
        self.assertFalse(V.is_valid(x))

    def test_secret_and_event_grants_are_not_implicitly_supported(self):
        for field in ['secrets','events']:
            x=copy.deepcopy(FIXTURES[2]);x[field]=[{'grant':'invented'}]
            self.assertFalse(V.is_valid(x))

    def test_restore_requires_source_stopped(self):
        x=copy.deepcopy(FIXTURES[-1]);x['sourceStopped']=False
        self.assertFalse(V.is_valid(x))

    def test_frozen_bundle_path_subset(self):
        for name in ['../escape','/absolute','a/../escape','a//b','runtime/node_modules/@alica/kernel','state/key\\name','state/identity.json\x00']:
            x=copy.deepcopy(FIXTURES[-2]);x['files'][0]['path']=name
            self.assertFalse(V.is_valid(x),name)

    def test_checksum_tampering(self):
        rows=chain(['STAGING','VERIFIED']);rows[-1]['record']['target']['bundleDigest']='sha256:'+'2'*64
        with self.assertRaises(ValueError):m.validate_chain(rows)

    def test_chain_skips_and_forks(self):
        for field,value in [('sequence',8),('previousHash',D),('transactionId','other'),('cellId','other'),('targetRevision',4)]:
            rows=chain(['STAGING','VERIFIED']);rows[-1]['record'][field]=value;rows[-1]=m.envelope(rows[-1]['record'])
            with self.assertRaises(ValueError):m.validate_chain(rows)

    def test_trust_never_rolls_back(self):
        for field,value in [('policyVersion',0),('revocationVersion',0),('lastWallMs',999),('rootKeyId','sha256:'+'2'*64)]:
            rows=chain(['STAGING','VERIFIED']);rows[-1]['record']['trustFloor'][field]=value;rows[-1]=m.envelope(rows[-1]['record'])
            with self.assertRaises(ValueError):m.validate_chain(rows)

    def test_uncertain_cleanup_cannot_be_successful_abort(self):
        rows=chain(['STAGING','RECOVERING','ABORTED']);rows[-1]['record']['outcome']='CLEANUP_UNCERTAIN';rows[-1]=m.envelope(rows[-1]['record'])
        with self.assertRaises(ValueError):m.validate_chain(rows)

    def test_commit_only_after_activation(self):
        with self.assertRaises(ValueError):m.validate_chain(chain(['STAGING','VERIFIED','COMMITTED']))

    def test_crash_model_before_publication_preserves_prior_selection(self):
        for states in [['STAGING'],['STAGING','VERIFIED'],['STAGING','VERIFIED','ACTIVATING']]:
            self.assertEqual(m.reconcile(chain(states),None,True,True),'ABORTED_STOPPED')

    def test_crash_model_after_publication_does_not_claim_running(self):
        for states in [['STAGING','VERIFIED','ACTIVATING'],['STAGING','VERIFIED','ACTIVATING','COMMITTED']]:
            self.assertEqual(m.reconcile(chain(states),A,True,True),'COMMITTED_STOPPED')

    def test_crash_model_corrupt_selection_fails_closed(self):
        self.assertEqual(m.reconcile(chain(['STAGING']),A,True,True),'NEEDS_OPERATOR')
        self.assertEqual(m.reconcile(chain(['STAGING','VERIFIED','ACTIVATING','COMMITTED']),None,True,True),'NEEDS_OPERATOR')

    def test_crash_model_trust_and_reap_required(self):
        for trust,reap in [(False,True),(True,False),(False,False)]:
            self.assertEqual(m.reconcile(chain(['STAGING']),None,trust,reap),'NEEDS_OPERATOR')

for i,fixture in enumerate(FIXTURES):
    def positive(self,x=copy.deepcopy(fixture)):
        V.validate(x)
    setattr(Contracts,f'test_valid_{i}',positive)
    for field in fixture:
        def missing(self,x=copy.deepcopy(fixture),key=field):
            del x[key];self.assertFalse(V.is_valid(x))
        setattr(Contracts,f'test_missing_{i}_{field}',missing)
    def unknown(self,x=copy.deepcopy(fixture)):
        x['unapprovedField']=True;self.assertFalse(V.is_valid(x))
    setattr(Contracts,f'test_unknown_{i}',unknown)

prefixes={'STAGING':['STAGING'],'VERIFIED':['STAGING','VERIFIED'],'ACTIVATING':['STAGING','VERIFIED','ACTIVATING'],'COMMITTED':['STAGING','VERIFIED','ACTIVATING','COMMITTED'],'RECOVERING':['STAGING','RECOVERING'],'ABORTED':['STAGING','RECOVERING','ABORTED'],'NEEDS_OPERATOR':['STAGING','RECOVERING','NEEDS_OPERATOR']}
for start in m.STATES:
    for finish in m.STATES:
        def transition(self,a=start,b=finish):
            rows=chain(prefixes[a]+[b])
            for row in rows: V.validate(row)
            if b in m.EDGES[a]:self.assertEqual(m.validate_chain(rows),b)
            else:
                with self.assertRaises(ValueError):m.validate_chain(rows)
        setattr(Contracts,f'test_edge_{start}_{finish}',transition)

if __name__=='__main__':unittest.main(verbosity=2)
