"""Generate a deliberately inspectable 512-coordinate, 72-layer unitary fixture."""
from pathlib import Path
import argparse
import numpy as np

def make_fixture():
    rng=np.random.default_rng(20261107)
    left=[];right=[];cosines=[];sines=[];offset=[0]
    operator=np.eye(512,dtype=np.complex128)
    for _ in range(72):
        order=rng.permutation(512)
        i,j=order[::2],order[1::2]
        theta=rng.uniform(-.35,.35,256)
        c,s=np.cos(theta),np.sin(theta)
        a,b=operator[i,:].copy(),operator[j,:].copy()
        operator[i,:]=c[:,None]*a-1j*s[:,None]*b
        operator[j,:]=-1j*s[:,None]*a+c[:,None]*b
        left.extend(i);right.extend(j);cosines.extend(c);sines.extend(s);offset.append(len(left))
    initial=rng.normal(size=(512,1))+1j*rng.normal(size=(512,1))
    initial=np.ascontiguousarray(initial/np.linalg.norm(initial,axis=0))
    return dict(pair_i=np.asarray(left,dtype=np.int64),pair_j=np.asarray(right,dtype=np.int64),
                cos_theta=np.asarray(cosines,dtype=np.float64),sin_theta=np.asarray(sines,dtype=np.float64),
                layer_offsets=np.asarray(offset,dtype=np.int64),operator=operator,
                archive_input=initial,archive_output=operator@initial)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args()
    if args.out.exists():raise FileExistsError('Use a fresh fixture output path')
    np.savez_compressed(args.out,**make_fixture())
