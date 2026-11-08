"""Standard-library package integrity check; no installation or network access."""
import hashlib
import json
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parent


def verify():
    manifest = json.loads((ROOT/'MANIFEST.json').read_text(encoding='utf-8'))
    checked = []
    for item in manifest['files']:
        relative = PurePosixPath(item['path'])
        if relative.is_absolute() or '..' in relative.parts or '\\' in item['path'] or ':' in item['path']:
            raise ValueError('Unsafe manifest member')
        file = ROOT.joinpath(*relative.parts)
        if not file.is_file() or file.is_symlink() or not file.resolve().is_relative_to(ROOT.resolve()):
            raise ValueError('Missing or unsafe file: '+str(relative))
        raw = file.read_bytes()
        if len(raw) != item['bytes'] or hashlib.sha256(raw).hexdigest() != item['sha256']:
            raise ValueError('File integrity failed: '+str(relative))
        checked.append(item['path'])
    if len(checked)!=len(set(checked)):
        raise ValueError('Duplicate manifest members')
    expected = set(checked) | {'MANIFEST.json'}
    actual = {p.relative_to(ROOT).as_posix() for p in ROOT.rglob('*') if p.is_file()}
    if actual != expected:
        raise ValueError('Unexpected/missing package files: '+str(sorted(actual ^ expected)))
    return dict(status='passed', files=len(checked), schema=manifest['schema'],
                note='Hashes check integrity; authenticate the ZIP checksum through the owner separately.')


if __name__ == '__main__':
    print(json.dumps(verify(), indent=2))
