#!/usr/bin/python3
"""G7 draft contract generator/reference model. NOT a runtime or crash qualification."""
import copy
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DRAFT = ROOT / 'docs/g7/draft'
MAX = 9007199254740991

def integer(low=0, high=MAX):
    return {'type': 'integer', 'minimum': low, 'maximum': high}

def text(pattern, maximum=128):
    return {'type': 'string', 'minLength': 1, 'maxLength': maximum, 'pattern': pattern}

def obj(properties):
    return {'type': 'object', 'additionalProperties': False, 'properties': properties, 'required': list(properties)}

def array(item, maximum, minimum=0):
    return {'type': 'array', 'items': item, 'minItems': minimum, 'maxItems': maximum, 'uniqueItems': True}

def ref(name):
    return {'$ref': '#/$defs/' + name}

def nullable(schema):
    return {'anyOf': [schema, {'type': 'null'}]}

DIGEST = text(r'^sha256:[0-9a-f]{64}$', 71)
ID = text(r'^[A-Za-z0-9][A-Za-z0-9_-]*$')
DNS = text(r'^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$')
PATH = text(r'^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*(?:/[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)*$', 240)
STATES = ['STAGING', 'VERIFIED', 'ACTIVATING', 'COMMITTED', 'RECOVERING', 'ABORTED', 'NEEDS_OPERATOR']
EDGES = {'STAGING': ['VERIFIED', 'RECOVERING'], 'VERIFIED': ['ACTIVATING', 'RECOVERING'], 'ACTIVATING': ['COMMITTED', 'RECOVERING'], 'RECOVERING': ['ABORTED', 'NEEDS_OPERATOR'], 'COMMITTED': [], 'ABORTED': [], 'NEEDS_OPERATOR': []}
LIMITS = {'jsonBytes': 1048576, 'jsonDepth': 32, 'artifactCount': 4096, 'tarEntries': 4098, 'tarBytes': 1073741824, 'expandedBytes': 1073741824, 'fileBytes': 268435456, 'pathBytes': 240, 'pathComponents': 16, 'diskReserveBytes': 536870912, 'verifyTimeoutMs': 300000, 'activationTimeoutMs': 30000, 'cleanupTimeoutMs': 30000, 'adminFrameBytes': 65536, 'adminConnections': 8, 'adminTimeoutMs': 30000, 'journalRecords': 4096, 'journalRecordBytes': 16384, 'backupPlainBytes': 2147483648, 'backupCipherBytes': 2151677952}

def schema():
    defs = {}
    defs['release'] = obj({k: DIGEST for k in ['bundleDigest', 'profileDigest', 'lockDigest', 'policyDigest', 'authorizationDigest']})
    defs['floor'] = obj({'rootKeyId': DIGEST, 'policyVersion': integer(1), 'revocationVersion': integer(1), 'lastWallMs': integer()})
    defs['accepted'] = obj({'schemaVersion': {'const': 'alica.cell-accepted/v1'}, 'cellId': ID, 'transactionId': ID, 'sequence': integer(1), 'release': ref('release'), 'trustFloor': ref('floor')})
    defs['journalBody'] = obj({'schemaVersion': {'const': 'alica.cell-journal/v1'}, 'cellId': ID, 'transactionId': ID, 'sequence': integer(1), 'priorRevision': integer(), 'targetRevision': integer(1), 'operation': {'enum': ['install', 'upgrade', 'recover', 'restore']}, 'state': {'enum': STATES}, 'prior': nullable(ref('release')), 'target': ref('release'), 'trustFloor': ref('floor'), 'previousHash': nullable(DIGEST), 'outcome': {'enum': ['PENDING', 'OK', 'VALIDATION_FAILED', 'ACTIVATION_FAILED', 'CLEANUP_UNCERTAIN', 'CRASH_RECONCILIATION']}})
    defs['journal'] = obj({'record': ref('journalBody'), 'checksum': DIGEST})
    defs['capabilityIntent'] = obj({'principal': DNS, 'scope': ID, 'capabilityId': DNS, 'operations': array(text(r'^[a-z][A-Za-z0-9]*$'), 256, 1), 'lifetimeMs': integer(1, 30000)})
    defs['authorization'] = obj({'schemaVersion': {'const': 'alica.cell-authorization/v1'}, 'profileDigest': DIGEST, 'capabilities': array(ref('capabilityIntent'), 256), 'secrets': {'type': 'array', 'maxItems': 0}, 'events': {'type': 'array', 'maxItems': 0}})
    defs['adminRequest'] = obj({'schemaVersion': {'const': 'alica.cell-admin-request/v1'}, 'requestId': ID, 'incarnation': ID, 'expectedSequence': integer(), 'operation': {'enum': ['status', 'verify', 'stop', 'start']}})
    defs['adminResponse'] = obj({'schemaVersion': {'const': 'alica.cell-admin-response/v1'}, 'requestId': ID, 'incarnation': ID, 'sequence': integer(), 'status': {'enum': ['STOPPED', 'RUNNING', 'FAILED', 'NEEDS_OPERATOR']}, 'code': {'enum': ['OK', 'CONFLICT', 'DENIED', 'INVALID', 'TIMEOUT', 'CLEANUP_UNCERTAIN']}, 'acceptedDigest': nullable(DIGEST)})
    defs['backupFile'] = obj({'path': PATH, 'digest': DIGEST, 'bytes': integer(0, LIMITS['fileBytes'])})
    defs['backup'] = obj({'schemaVersion': {'const': 'alica.cell-backup/v1'}, 'backupId': ID, 'cellId': ID, 'createdAtMs': integer(), 'accepted': ref('accepted'), 'trustFloor': ref('floor'), 'recoveryKeyId': DIGEST, 'format': {'const': 'age-encryption.org/v1'}, 'files': array(ref('backupFile'), 8192, 1)})
    defs['recoveryApproval'] = obj({'schemaVersion': {'const': 'alica.cell-recovery-approval/v1'}, 'cellId': ID, 'backupCipherDigest': DIGEST, 'approvedAtMs': integer(), 'minimumFloor': ref('floor'), 'authorizationDigest': DIGEST, 'sourceStopped': {'const': True}})
    names = ['accepted', 'journal', 'authorization', 'adminRequest', 'adminResponse', 'backup', 'recoveryApproval']
    return {'$schema': 'https://json-schema.org/draft/2020-12/schema', '$id': 'https://alica.invalid/g7/draft/contracts.schema.json', '$defs': defs, 'oneOf': [ref(n) for n in names]}

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()

def digest(value):
    return 'sha256:' + hashlib.sha256(canonical(value)).hexdigest()

def envelope(record):
    return {'record': copy.deepcopy(record), 'checksum': digest(record)}

def validate_chain(records):
    """Reference transition semantics only; no filesystem or process simulation."""
    if not records or len(records) > LIMITS['journalRecords']:
        raise ValueError('Journal count')
    previous = None
    for item in records:
        row = item['record']
        if row['targetRevision'] != row['priorRevision'] + 1:
            raise ValueError('Accepted revision increment')
        if item['checksum'] != digest(row):
            raise ValueError('Journal checksum')
        if previous is None:
            if row['state'] != 'STAGING' or row['sequence'] != 1 or row['previousHash'] is not None:
                raise ValueError('Initial record')
        else:
            prev = previous['record']
            if row['sequence'] != prev['sequence'] + 1 or row['previousHash'] != previous['checksum']:
                raise ValueError('Sequence/hash chain')
            if row['state'] not in EDGES[prev['state']]:
                raise ValueError('Transition')
            for k in ['cellId', 'transactionId', 'operation', 'prior', 'target', 'priorRevision', 'targetRevision']:
                if row[k] != prev[k]:
                    raise ValueError('Transaction identity changed')
            if row['trustFloor']['rootKeyId'] != prev['trustFloor']['rootKeyId']:
                raise ValueError('Rotation is separate authenticated operation')
            for k in ['policyVersion', 'revocationVersion', 'lastWallMs']:
                if row['trustFloor'][k] < prev['trustFloor'][k]:
                    raise ValueError('Trust rollback')
        state, outcome = row['state'], row['outcome']
        if (state in ['STAGING', 'VERIFIED', 'ACTIVATING'] and outcome != 'PENDING') or (state == 'COMMITTED' and outcome != 'OK') or (state in ['RECOVERING', 'ABORTED', 'NEEDS_OPERATOR'] and outcome in ['PENDING', 'OK']):
            raise ValueError('Outcome/state mismatch')
        if state == 'ABORTED' and outcome == 'CLEANUP_UNCERTAIN':
            raise ValueError('Uncertain cleanup requires operator')
        previous = item
    assert previous is not None
    return previous['record']['state']

def reconcile(records, accepted, current_trust, reaped):
    """Model disposition, NOT implemented filesystem recovery or runtime readiness."""
    state = validate_chain(records)
    last = records[-1]['record']
    if not current_trust or not reaped or state == 'NEEDS_OPERATOR':
        return 'NEEDS_OPERATOR'
    if accepted is not None and accepted['cellId'] != last['cellId']:
        return 'NEEDS_OPERATOR'
    if accepted is not None and accepted['release'] == last['target']:
        valid_pointer = accepted['transactionId'] == last['transactionId'] and accepted['sequence'] == last['targetRevision']
        return 'COMMITTED_STOPPED' if valid_pointer and state in ['ACTIVATING', 'COMMITTED'] else 'NEEDS_OPERATOR'
    prior_matches = (accepted is None and last['prior'] is None and last['priorRevision'] == 0) or (accepted is not None and accepted['release'] == last['prior'] and accepted['sequence'] == last['priorRevision'] and accepted['transactionId'] != last['transactionId'])
    if prior_matches:
        return 'ABORTED_STOPPED' if state != 'COMMITTED' else 'NEEDS_OPERATOR'
    return 'NEEDS_OPERATOR'

if __name__ == '__main__':
    DRAFT.mkdir(parents=True, exist_ok=True)
    (DRAFT / 'contracts.schema.json').write_text(json.dumps(schema(), indent=2) + '\n')
    (DRAFT / 'limits.json').write_text(json.dumps(LIMITS, indent=2) + '\n')
    print('Generated draft schemas/limits; NOT approved and NOT runtime qualification.')
