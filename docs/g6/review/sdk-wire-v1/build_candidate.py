"""REVIEW ONLY. Build a standalone candidate; never modify active G6 schemas."""
from pathlib import Path
from copy import deepcopy
import json

ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
CANDIDATE_ID = 'https://alica.invalid/review/g6/sdk-wire-v1/frames.schema.json'
FEATURES = ('wire.contexts', 'wire.sdkresults', 'wire.scopedeffects')

def obj(**properties):
    return {'type': 'object', 'additionalProperties': False,
            'properties': properties, 'required': list(properties)}

def build():
    schema = json.loads((ROOT / 'docs/g6/draft/frames.schema.json').read_text())
    schema['$id'] = CANDIDATE_ID
    schema['title'] = 'UNAPPROVED G6 SDK wire addendum review candidate'
    schema['$comment'] = 'Review only: not imported by runtime, active generator or check pipeline.'
    positive = {'type': 'integer', 'minimum': 1, 'maximum': 9007199254740991}
    ident = {'type': 'string', 'minLength': 1, 'maxLength': 128,
             'pattern': '^[A-Za-z0-9][A-Za-z0-9_-]*$'}
    duration = {'type': 'integer', 'minimum': 1, 'maximum': 30000}
    error = {'$ref': 'https://alica.invalid/specs/error.schema.json'}
    def body(kind, **fields):
        return obj(kind={'const': kind}, wireId=deepcopy(positive), **fields)
    register = body('effect-register', scopeId=ident, scopeGeneration=positive, callbackId=ident)
    release = body('effect-release', effectId=ident)
    cleanup = body('effect-cleanup', effectId=ident, callbackId=ident, remainingMs=duration)
    cleaned = body('effect-cleaned', effectId=ident)
    cleanup_error = body('effect-cleanup-error', effectId=ident, error=error)
    published = obj(kind={'const': 'published'}, admitted={
        'type': 'integer', 'minimum': 0, 'maximum': 9007199254740991})
    registered = obj(kind={'const': 'effect-registered'}, effectId=ident)
    released = obj(kind={'const': 'effect-released'}, effectId=ident)
    # Directional selections contain inline copies; transform each explicit
    # body union, never globally append variants to an unrestricted response.
    def walk(node, definition):
        if isinstance(node, list):
            for child in list(node):
                walk(child, definition)
        elif isinstance(node, dict):
            variants = node.get('oneOf')
            if variants:
                kinds = {v.get('properties', {}).get('kind', {}).get('const') for v in variants}
                if 'bind' in kinds:
                    variants.extend(deepcopy([register, release]))
                if 'lifecycle' in kinds:
                    variants.append(deepcopy(cleanup))
                if 'disposed' in kinds:
                    variants.extend(deepcopy([cleaned, cleanup_error]))
                if 'bound' in kinds and definition != 'controlToProvider':
                    variants.extend(deepcopy([published, registered, released]))
            for child in list(node.values()):
                walk(child, definition)
    for name, definition in schema['$defs'].items():
        walk(definition, name)
    # Explicit mandatory minor/feature barrier: old peers cannot silently run
    # an SDK with the new result/cleanup semantics. All existing R2 limits stay.
    for tag, feature_field in [('hello', 'requiredFeatures'), ('accepted', 'negotiatedFeatures')]:
        props = schema['$defs'][tag]['properties']['body']['properties']
        props['protocolMinor'] = {'const': 1}
        props[feature_field].pop('contains', None)
        props[feature_field]['allOf'] = [{'contains': {'const': feature}} for feature in FEATURES]
    props = schema['$defs']['accepted']['properties']['body']
    props['properties']['effectLimit'] = {'type': 'integer', 'minimum': 1, 'maximum': 4096}
    props['required'].append('effectLimit')
    return schema

def encoded():
    return json.dumps(build(), indent=2, ensure_ascii=True) + '\n'

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    target = HERE / 'frames.schema.json'
    text = encoded()
    if args.check:
        if target.read_text() != text:
            raise SystemExit('Candidate snapshot differs from deterministic generator')
        print('REVIEW ONLY: candidate snapshot matches; runtimeQualification=false')
    else:
        target.write_text(text)
        print('Wrote review-only candidate snapshot:', target)
