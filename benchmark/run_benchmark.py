"""Bounded standalone evaluator; original candidate kernel source is not included."""
import os
for variable in ('OMP_NUM_THREADS','OPENBLAS_NUM_THREADS','MKL_NUM_THREADS','VECLIB_MAXIMUM_THREADS','NUMEXPR_NUM_THREADS'):
    os.environ[variable] = '1'
import argparse
import csv
import json
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import time
import traceback
sys.dont_write_bytecode = True
from verify_package import verify, ROOT


def write(path, value):
    path.write_text(json.dumps(value, indent=2, allow_nan=False)+'\n', encoding='utf-8')


def worker(args, out):
    import numpy as np
    from threadpoolctl import threadpool_info
    checks, sessions = [], []
    cp = None
    gpu_reason = None
    if args.backend != 'cpu':
        try:
            import cupy as cp
            device = cp.cuda.Device()
            capability = device.compute_capability
            binary = ROOT/'binaries'/('candidate-sm'+capability+'.cubin')
            if not binary.exists():
                raise RuntimeError('No candidate binary built for SM'+capability)
            module = cp.RawModule(path=str(binary))
            kernel = module.get_function('pair_layer')
            cp.get_default_memory_pool().set_limit(size=512*1024**2)
        except Exception as error:
            gpu_reason = type(error).__name__+': '+str(error)
            if args.backend == 'cuda':
                raise
            cp = None
    pools = threadpool_info()
    if not pools or any(p['num_threads'] != 1 for p in pools):
        raise RuntimeError('Expected one CPU BLAS thread; record a failed admission, do not compare.')
    environment = dict(python=sys.version, numpy=np.__version__, platform=platform.platform(),
                       processor=platform.processor(), logical_cpus=os.cpu_count(),
                       threadpools=[{k:p.get(k) for k in ('internal_api','version','num_threads','architecture')} for p in pools],
                       gpu_unavailable_reason=gpu_reason, thermal_guard_available=bool(cp is not None and shutil.which('nvidia-smi')),
                       background_load='Uncontrolled; describe concurrent work separately.')
    if cp is not None:
        environment.update(cupy=cp.__version__, cuda_runtime=cp.cuda.runtime.runtimeGetVersion(),
                           cuda_driver=cp.cuda.runtime.driverGetVersion(), capability=capability,
                           gpu_name=cp.cuda.runtime.getDeviceProperties(0)['name'].decode(),
                           candidate_binary=binary.name,gpu_pci_bus_id=cp.cuda.Device().pci_bus_id)
    write(out/'environment.json', environment)
    f = np.load(ROOT/'fixture.npz', allow_pickle=False)
    ii,jj,c,s,offset,U = (f[k] for k in ('pair_i','pair_j','cos_theta','sin_theta','layer_offsets','operator'))
    if ii.dtype != np.int64 or jj.dtype != np.int64 or c.dtype != np.float64 or s.dtype != np.float64 or U.dtype != np.complex128:
        raise ValueError('Fixture precision/dtype mismatch')
    if U.shape != (512,512) or offset.shape != (73,) or offset[0] != 0 or offset[-1] != len(ii):
        raise ValueError('Fixture dimensions mismatch')
    if np.any(ii<0) or np.any(jj<0) or np.any(ii>=512) or np.any(jj>=512) or np.any(np.diff(offset)<0):
        raise ValueError('Invalid pair geometry')
    for layer in range(72):
        lo,hi=offset[layer:layer+2]
        if len(np.unique(np.r_[ii[lo:hi],jj[lo:hi]])) != 2*(hi-lo):
            raise ValueError('Non-disjoint layer')
    def check(name, actual, expected):
        if actual.shape != expected.shape:
            raise ValueError('Output shape mismatch: '+name)
        error=float(np.max(np.abs(actual-expected)))
        passed=bool(np.isfinite(actual).all() and error<=1e-12)
        checks.append(dict(name=name,max_absolute_error=error,tolerance=1e-12,passed=passed))
        write(out/'checks.json', checks)
        if not passed:raise ValueError('Numerical gate failed: '+name)
    check('coefficient_norm', c*c+s*s, np.ones_like(c))
    if cp is not None:
        a=time.perf_counter()
        gi,gj,gc,gs,gU=(cp.asarray(v) for v in (ii,jj,c,s,U))
        cp.cuda.get_current_stream().synchronize()
        write(out/'gpu-setup.json',dict(metadata_upload_s=time.perf_counter()-a,load_boundary='Binary module load is outside apply timing; imports/device initialization outside apply.'))
    def pairs(x,xp,adjoint=False):
        z=x.reshape(-1,512,x.shape[1]).copy()
        for layer in (range(71,-1,-1) if adjoint else range(72)):
            lo,hi=map(int,offset[layer:layer+2])
            i,j,ct,st=(ii[lo:hi],jj[lo:hi],c[lo:hi],s[lo:hi]) if xp is np else (gi[lo:hi],gj[lo:hi],gc[lo:hi],gs[lo:hi])
            a=z[:,i,:].copy();b=z[:,j,:].copy();sign=1j if adjoint else -1j
            z[:,i,:]=ct[None,:,None]*a+sign*st[None,:,None]*b
            z[:,j,:]=sign*st[None,:,None]*a+ct[None,:,None]*b
        return z.reshape(x.shape)
    def blas(x,xp):
        groups=x.shape[0]//512;batch=x.shape[1]
        packed=x.reshape(groups,512,batch).transpose(1,0,2).reshape(512,-1)
        return ((U if xp is np else gU)@packed).reshape(512,groups,batch).transpose(1,0,2).reshape(x.shape)
    def fused(x):
        z=x.copy();groups=x.shape[0]//512;batch=x.shape[1]
        for layer in range(72):
            lo=int(offset[layer]);count=int(offset[layer+1]-lo);threads=groups*count*batch
            if threads:kernel(((threads+255)//256,),(256,),(z,gi,gj,gc,gs,np.int32(lo),np.int32(count),np.int32(groups),np.int32(batch)))
        return z
    last_thermal=0
    def guard():
        nonlocal last_thermal
        if cp is not None and time.monotonic()-last_thermal>1 and shutil.which('nvidia-smi'):
            r=subprocess.run(['nvidia-smi','--id='+environment['gpu_pci_bus_id'],'--query-gpu=temperature.gpu','--format=csv,noheader,nounits'],capture_output=True,text=True,timeout=4,check=True)
            temperature=float(r.stdout.strip().splitlines()[0])
            if temperature>=78:raise RuntimeError('78 C thermal stop; preserve partial output.')
            last_thermal=time.monotonic()
    check('fixture_cpu_pair', pairs(f['archive_input'],np), f['archive_output'])
    check('fixture_cpu_blas', blas(f['archive_input'],np), f['archive_output'])
    if cp is not None:check('fixture_candidate', cp.asnumpy(fused(cp.asarray(f['archive_input']))),f['archive_output'])
    cases=[(512,1),(65536,8)] if args.mode=='smoke' else [(n,b) for n in (512,8192,65536) for b in (1,8)]
    trials=1 if args.mode=='smoke' else 5
    for n,batch in cases:
        guard();seed=181819+1000003*args.replicate+n+batch
        rng=np.random.default_rng(seed);X=rng.normal(size=(n,batch))+1j*rng.normal(size=(n,batch))
        X=np.ascontiguousarray(X/np.linalg.norm(X,axis=0));reference=blas(X,np)
        check(f'{n}/{batch}/reference_pair',pairs(X,np),reference)
        check(f'{n}/{batch}/norm',np.sum(np.abs(reference)**2,axis=0),np.sum(np.abs(X)**2,axis=0))
        check(f'{n}/{batch}/adjoint',pairs(reference,np,True),X)
        np.savez_compressed(out/f'n{n}-b{batch}-input-reference.npz',input=X,reference=reference)
        functions={'cpu_pairs':lambda:pairs(X,np),'cpu_blas':lambda:blas(X,np)}
        if cp is not None:
            gX=cp.asarray(X);cp.cuda.get_current_stream().synchronize()
            for name,fn in [('cupy',lambda x:pairs(x,cp)),('candidate',fused),('blas',lambda x:blas(x,cp))]:
                functions['gpu_'+name+'_resident']=lambda fn=fn:fn(gX)
                functions['gpu_'+name+'_full_io']=lambda fn=fn:cp.asnumpy(fn(cp.asarray(X)))
        for trial in range(-1,trials):
            order=list(functions);np.random.default_rng(seed+trial+131).shuffle(order)
            for name in order:
                guard()
                if cp is not None:cp.cuda.get_current_stream().synchronize()
                wall=time.time();a=time.perf_counter();value=functions[name]()
                if name.startswith('gpu_'):cp.cuda.get_current_stream().synchronize()
                elapsed=time.perf_counter()-a;end=time.time()
                a=time.perf_counter();actual=cp.asnumpy(value) if name.endswith('_resident') else value
                materialization=time.perf_counter()-a
                check(f'n{n}-b{batch}/{name}/trial{trial}',actual,reference)
                if trial<0:continue
                file=f'n{n}-b{batch}-{name}-t{trial}.npz'
                np.savez_compressed(out/file,output=actual)
                sessions.append(dict(n=n,batch=batch,seed=seed,replicate=args.replicate,method=name,trial=trial,
                                     seconds=elapsed,wall_start=wall,wall_end=end,materialization_s=materialization,
                                     vectors_per_s=batch/elapsed,output_file=file))
                with (out/'timings.csv').open('w',newline='',encoding='utf-8') as stream:
                    writer=csv.DictWriter(stream,fieldnames=list(sessions[0]));writer.writeheader();writer.writerows(sessions)
        projected=''.join('+' if v.real>=0 else '-' for v in reference[:128,0])
        (out/f'n{n}-b{batch}-projection.txt').write_text(projected+'\n',encoding='utf-8')
    metrics=dict(status='completed' if cp is not None else 'baseline_only',mode=args.mode,
                 checks=len(checks),passing_checks=sum(c['passed'] for c in checks),timing_sessions=len(sessions),
                 candidate_executed=cp is not None,energy_j=None,energy_status='unmeasured: no corresponding power stream',
                 scope='Fixed512-coordinate operator repeated independently; 72layers; complex128; full outputs.',
                 next='Independent replay; then three fresh benchmark processes and optional separately admitted sustained energy capture.')
    write(out/'metrics.json',metrics)
    (out/'REPORT.md').write_text('# Hardware evaluation result\n\n'+json.dumps(metrics,indent=2)+'\n\nImports, plan loading, setup and output validation/storage are outside apply timing. Resident GPU readback is separately timed; full_io includes upload and complete download. Source smoke is a validity check, not a sustained performance or energy claim.\n',encoding='utf-8')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode',choices=['smoke','benchmark'],default='smoke')
    parser.add_argument('--backend',choices=['auto','cpu','cuda'],default='auto')
    parser.add_argument('--out',required=True,type=Path)
    parser.add_argument('--replicate',type=int,choices=range(3),default=0)
    parser.add_argument('--worker',action='store_true',help=argparse.SUPPRESS)
    args=parser.parse_args();verify();out=args.out.resolve()
    if out==ROOT or out.is_relative_to(ROOT):raise ValueError('Write results outside the sealed package.')
    if args.worker:
        try:worker(args,out)
        except Exception:
            write(out/'STOP.json',dict(error=traceback.format_exc()))
            write(out/'metrics.json',dict(status='hold_for_review',candidate_executed=None,energy_j=None))
            raise
        return
    out.mkdir(parents=True,exist_ok=False)
    command=[sys.executable,str(Path(__file__).resolve()),'--mode',args.mode,'--backend',args.backend,
             '--replicate',str(args.replicate),'--out',str(out),'--worker']
    scratch=out.with_name(out.name+'-scratch');scratch.mkdir(exist_ok=False)
    environment=os.environ.copy()
    for name in ('TEMP','TMP','TMPDIR'):environment[name]=str(scratch)
    environment['CUPY_CACHE_DIR']=str(scratch/'cupy-cache')
    with (out/'worker.log').open('w',encoding='utf-8') as log:
        child=subprocess.Popen(command,stdout=log,stderr=log,env=environment)
        try:code=child.wait(timeout=180)
        except subprocess.TimeoutExpired:
            child.kill();child.wait();write(out/'STOP.json',dict(error='180-second worker timeout'))
            raise RuntimeError('Bounded worker stopped; partial results preserved.')
    if code:raise RuntimeError('Worker failed; inspect '+str(out/'worker.log'))
    import hashlib
    write(out/'ARTIFACT-HASHES.json',{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in out.iterdir() if p.is_file()})
    print((out/'metrics.json').read_text(encoding='utf-8'))


if __name__=='__main__':main()
