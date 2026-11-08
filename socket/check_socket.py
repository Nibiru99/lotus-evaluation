"""Independent fixed-fixture arithmetic/continuation receipt check; standard library."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parent
MOD = 1 << 64
ROLES = ('left', 'right', 'output')

def fixtures():
    raw = (ROOT/'fixtures.json').read_bytes()
    return json.loads(raw), hashlib.sha256(raw).hexdigest()

def verify(record):
    fixture, digest = fixtures()
    allowed = {'schema', 'fixtureSha256', 'execution', 'hardwareAccelerationTested', 'resumeAfterJob', 'resumeMatchesUninterrupted', 'results'}
    if not isinstance(record, dict) or set(record) != allowed:
        raise ValueError('Unexpected receipt fields; private state must stay outside this result')
    if record.get('schema') != 'lotus.socket-evaluation/1' or record.get('fixtureSha256') != digest:
        raise ValueError('Fixture/schema mismatch')
    if record.get('execution') != 'host-source-bound' or record.get('hardwareAccelerationTested') is not False:
        raise ValueError('Explicit host execution scope required')
    if record.get('resumeAfterJob') != 3 or record.get('resumeMatchesUninterrupted') is not True:
        raise ValueError('Mid-run continuation control missing')
    results = record.get('results')
    if not isinstance(results, list) or len(results) != len(fixture['cases']):
        raise ValueError('Complete fixed case list required')
    previous = previous_hashes = None
    for expected, actual in zip(fixture['cases'], results):
        fields = {'job', 'resultHex', 'postSourceHex', 'finalBorrow', 'acceptedSites', 'timesBefore', 'timesAfter', 'stateHashesBefore', 'stateHashesAfter'}
        if not isinstance(actual, dict) or set(actual) != fields:
            raise ValueError('Unexpected case fields')
        a, b = int(expected['left']), int(expected['right'])
        if type(actual.get('job')) is not int or actual['job'] != expected['job']:
            raise ValueError('Ordered job mismatch')
        expected_word = f'{(a-b) % MOD:016x}'
        if actual.get('resultHex') != expected_word or actual.get('postSourceHex') != expected_word:
            raise ValueError('Arithmetic or post-source retention failure')
        if type(actual.get('finalBorrow')) is not int or actual['finalBorrow'] != int(a < b):
            raise ValueError('Final borrow mismatch')
        if actual.get('acceptedSites') != 5:
            raise ValueError('Five-site traversal required')
        before, after = actual.get('timesBefore', {}), actual.get('timesAfter', {})
        if any(not isinstance(actual[k], dict) or set(actual[k]) != set(ROLES) for k in ('timesBefore', 'timesAfter', 'stateHashesBefore', 'stateHashesAfter')):
            raise ValueError('Exact role fields required')
        for role in ROLES:
            start, end = before.get(role), after.get(role)
            if type(start) not in (int, float) or type(end) not in (int, float) or not (0 <= start < end < float('inf')):
                raise ValueError('Source clock did not advance')
            if previous is not None and start != previous[role]:
                raise ValueError('Source timeline discontinuity')
            for field in ('stateHashesBefore', 'stateHashesAfter'):
                value = actual.get(field, {}).get(role)
                if not isinstance(value, str) or not re.fullmatch('[0-9a-f]{64}', value):
                    raise ValueError('Source-state digest missing')
            if actual['stateHashesBefore'][role] == actual['stateHashesAfter'][role]:
                raise ValueError('Source state did not change')
            if previous_hashes is not None and actual['stateHashesBefore'][role] != previous_hashes[role]:
                raise ValueError('Source-state hash discontinuity')
        previous = after
        previous_hashes = actual['stateHashesAfter']
    return dict(status='passed', cases=len(results), site_visits=5*len(results),
                scope='Independent exact answers, declared source continuity and receipt structure; backend assertions are not authenticated by this checker')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--receipt', type=Path, help='Check a saved receipt; does not execute a backend')
    mode.add_argument('--adapter', type=Path, help='Execute a separately supplied trusted Node.js adapter')
    parser.add_argument('--out', type=Path, help='New result file, required with --adapter')
    args = parser.parse_args()
    if args.adapter:
        if args.out is None or args.out.exists():
            parser.error('--adapter requires a fresh --out file')
        fixture, digest = fixtures()
        result = subprocess.run(['node', str(args.adapter.resolve())], input=json.dumps(dict(fixture=fixture, fixtureSha256=digest)),
                                capture_output=True, text=True, encoding='utf-8', timeout=120)
        if result.returncode:
            raise RuntimeError('Adapter failed: '+result.stderr[-1600:])
        if len(result.stdout) > 131072:
            raise ValueError('Oversized adapter receipt')
        record = json.loads(result.stdout)
        summary = verify(record)
        with args.out.open('x', encoding='utf-8') as output:
            json.dump(record, output, indent=2)
            output.write('\n')
    else:
        record = json.loads(args.receipt.read_text(encoding='utf-8'))
        summary = verify(record)
    print(json.dumps(summary, indent=2))

if __name__ == '__main__':
    main()
