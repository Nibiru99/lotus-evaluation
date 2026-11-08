"""Independent full-output replay using row-oriented matrix evaluation; CPU only."""
import os
for key in ('OPENBLAS_NUM_THREADS','MKL_NUM_THREADS','OMP_NUM_THREADS'):os.environ[key]='1'
import argparse
import csv
import hashlib
import json
from pathlib import Path
import sys
sys.dont_write_bytecode=True
import numpy as np
from verify_package import verify, ROOT


def replay(folder):
    verify()
    hashes=json.loads((folder/'ARTIFACT-HASHES.json').read_text(encoding='utf-8'))
    for name,pin in hashes.items():
        file=folder/name
        if Path(name).name!=name or file.is_symlink() or not file.is_file() or hashlib.sha256(file.read_bytes()).hexdigest()!=pin:
            raise ValueError('Result integrity failed: '+name)
    with np.load(ROOT/'fixture.npz',allow_pickle=False) as saved:
        fixture={key:saved[key].copy() for key in saved.files}
    U=fixture['operator']
    # Independently evaluate original archive with scalar pair ordering, not candidate code.
    archive=fixture['archive_input'].copy()
    for layer in range(72):
        for k in range(int(fixture['layer_offsets'][layer]),int(fixture['layer_offsets'][layer+1])):
            i,j=int(fixture['pair_i'][k]),int(fixture['pair_j'][k])
            a,b=archive[i].copy(),archive[j].copy();c,s=fixture['cos_theta'][k],fixture['sin_theta'][k]
            archive[i]=c*a-1j*s*b;archive[j]=c*b-1j*s*a
    if np.max(np.abs(archive-fixture['archive_output']))>1e-12:raise ValueError('Original archive replay failed')
    checks=[];expected={}
    with (folder/'timings.csv').open(newline='',encoding='utf-8') as f:rows=list(csv.DictReader(f))
    for row in rows:
        n,b=int(row['n']),int(row['batch']);key=(n,b)
        if key not in expected:
            with np.load(folder/f'n{n}-b{b}-input-reference.npz',allow_pickle=False) as f:X=f['input'].copy();saved=f['reference'].copy()
            rng=np.random.default_rng(int(row['seed']));generated=rng.normal(size=(n,b))+1j*rng.normal(size=(n,b));generated=np.ascontiguousarray(generated/np.linalg.norm(generated,axis=0))
            if not np.array_equal(X,generated):raise ValueError('Seed/input mismatch')
            # Rows represent one independently repeated 512-coordinate block/batch.
            flat=X.T.reshape(b,n//512,512).reshape(-1,512)
            Y=(flat@U.T).reshape(b,n//512,512).reshape(b,n).T.copy()
            if np.max(np.abs(Y-saved))>1e-12:raise ValueError('Saved reference mismatch')
            if np.max(np.abs(np.sum(abs(Y)**2,axis=0)-np.sum(abs(X)**2,axis=0)))>1e-12:raise ValueError('Norm control failed')
            expected[key]=Y
        name=row['output_file']
        if Path(name).name!=name:raise ValueError('Unsafe result path')
        with np.load(folder/name,allow_pickle=False) as f:actual=f['output']
        if actual.shape!=(n,b):raise ValueError('Output shape mismatch')
        error=float(np.max(np.abs(actual-expected[key])))
        passed=bool(np.isfinite(actual).all() and error<=1e-12)
        checks.append(dict(output_file=name,passed=passed,max_absolute_error=error))
        if not passed:raise ValueError('Independent replay failed: '+name)
    receipt=dict(status='passed',timed_outputs=len(checks),complete_vectors=sum(int(r['batch']) for r in rows),
                 public_fixture_replayed=True,checks=checks,energy_verified=False,
                 scope='Numerical replay only; timing receipts and hardware identity are self-reported by the operator.')
    target=folder.with_name(folder.name+'-independent-replay.json')
    if target.exists():raise FileExistsError('Preserve earlier replay: '+str(target))
    target.write_text(json.dumps(receipt,indent=2,allow_nan=False)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in receipt.items() if k!='checks'},indent=2))


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('results',type=Path);a=p.parse_args();replay(a.results.resolve())
