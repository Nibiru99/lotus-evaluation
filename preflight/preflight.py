"""Public-synthetic hardware qualification; contains no research map or candidate."""
import os
for k in ('OPENBLAS_NUM_THREADS','MKL_NUM_THREADS','OMP_NUM_THREADS','VECLIB_MAXIMUM_THREADS'):os.environ[k]='1'
import argparse,csv,hashlib,json,platform,subprocess,sys,time,traceback
from pathlib import Path
sys.dont_write_bytecode=True
from verify_package import verify


def write(p,v):p.write_text(json.dumps(v,indent=2,allow_nan=False)+'\n',encoding='utf-8')


def run(a):
    import numpy as np
    cp=None;reason=None
    try:
        if a.backend!='cpu':
            import cupy as cp
            cp.cuda.Device().synchronize()
            cp.get_default_memory_pool().set_limit(size=256*1024**2)
    except Exception as e:
        if a.backend=='cuda':raise
        cp=None;reason=type(e).__name__
    environment=dict(python=sys.version,numpy=np.__version__,os=platform.platform(),processor=platform.processor(),logical_cpus=os.cpu_count(),
                     gpu_unavailable_reason=reason,background_load='Operator to describe; not controlled',identity_attested=False)
    if cp is not None:
        environment.update(cupy=cp.__version__,gpu=cp.cuda.runtime.getDeviceProperties(0)['name'].decode(),
                           cuda_runtime=cp.cuda.runtime.runtimeGetVersion(),cuda_driver=cp.cuda.runtime.driverGetVersion())
    rng=np.random.default_rng(231023)
    clock=time.perf_counter()
    raw=rng.normal(size=(512,512))+1j*rng.normal(size=(512,512))
    U,_=np.linalg.qr(raw)
    X=rng.normal(size=(a.dimension,8))+1j*rng.normal(size=(a.dimension,8));X=np.ascontiguousarray(X/np.linalg.norm(X,axis=0))
    setup=time.perf_counter()-clock
    def apply(x,m,xp):
        groups=x.shape[0]//512;b=x.shape[1]
        packed=x.reshape(groups,512,b).transpose(1,0,2).reshape(512,-1)
        return (m@packed).reshape(512,groups,b).transpose(1,0,2).reshape(x.shape)
    reference=apply(X,U,np)
    methods={'cpu_blas':lambda:apply(X,U,np)}
    if cp is not None:
        gx,gu=cp.asarray(X),cp.asarray(U);cp.cuda.get_current_stream().synchronize()
        methods.update(gpu_blas_resident=lambda:apply(gx,gu,cp),gpu_blas_full_io=lambda:cp.asnumpy(apply(cp.asarray(X),gu,cp)))
    timings=[];outputs={};checks=[]
    for trial in range(-1,a.trials):
        order=list(methods);np.random.default_rng(231023+trial).shuffle(order)
        for name in order:
            if cp is not None:cp.cuda.get_current_stream().synchronize()
            start=time.perf_counter();value=methods[name]()
            if name.startswith('gpu'):cp.cuda.get_current_stream().synchronize()
            elapsed=time.perf_counter()-start
            actual=cp.asnumpy(value) if name.endswith('_resident') else value
            error=float(np.max(np.abs(actual-reference)))
            passed=bool(np.isfinite(actual).all() and error<=1e-12)
            checks.append(dict(method=name,trial=trial,error=error,passed=passed))
            if not passed:raise RuntimeError('Synthetic numerical gate failed')
            if trial>=0:
                timings.append(dict(method=name,trial=trial,seconds=elapsed,vectors_per_second=8/elapsed))
                outputs[name]=actual
    norm_error=float(np.max(np.abs(np.sum(abs(reference)**2,axis=0)-np.sum(abs(X)**2,axis=0))))
    assert norm_error<=1e-12
    # Independent row-oriented multiplication for the complete last output of each method.
    flat=X.T.reshape(8,a.dimension//512,512).reshape(-1,512)
    independent=(flat@U.T).reshape(8,a.dimension).T
    replay_error=max(float(np.max(np.abs(v-independent))) for v in outputs.values())
    assert replay_error<=1e-12
    np.savez_compressed(a.out/'synthetic-arrays.npz',public_matrix=U,input=X,reference=reference,**outputs)
    with (a.out/'timings.csv').open('w',newline='',encoding='utf-8') as f:
        w=csv.DictWriter(f,fieldnames=list(timings[0]));w.writeheader();w.writerows(timings)
    (a.out/'projection.txt').write_text(''.join('+' if v.real>=0 else '-' for v in reference[:128,0])+'\n')
    write(a.out/'environment.json',environment)
    result=dict(schema='lotus.synthetic-preflight/v0.1.0',status='supported synthetic numerical check',workload_kind='public_synthetic_calibration',
                dimension=a.dimension,batch=8,seed=231023,trials=a.trials,timing_sessions=len(timings),checks=checks,
                norm_error=norm_error,independent_last_output_error=replay_error,synthetic_setup_s=setup,
                protected_candidate_executed=False,protected_speedup_verified=False,energy_j=None,
                scope='Generic QR-unitary BLAS map repeated in512-coordinate blocks. No private operator, schedule, coefficients, binary or app source supplied.',
                next='Use environment and baseline timings for target-stack planning; original-candidate validation requires separately approved access.')
    write(a.out/'metrics.json',result)
    (a.out/'REPORT.md').write_text('# Synthetic hardware preflight\n\nGeneric public fixture only. This is hardware/environment qualification and full-output numerical checking; it does not reproduce the protected research map,25.33x result or facility savings. No power trace is recorded.\n')
    print(json.dumps({k:v for k,v in result.items() if k!='checks'},indent=2))


def main():
    verify()
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--out',type=Path,required=True);p.add_argument('--backend',choices=['auto','cpu','cuda'],default='auto')
    p.add_argument('--dimension',type=int,choices=[512,8192,65536],default=65536);p.add_argument('--trials',type=int,choices=range(1,6),default=3)
    p.add_argument('--worker',action='store_true',help=argparse.SUPPRESS);a=p.parse_args();a.out=a.out.resolve()
    if a.worker:
        try:run(a)
        except Exception:
            write(a.out/'STOP.json',dict(error=traceback.format_exc()));raise
        return
    a.out.mkdir(parents=True,exist_ok=False);scratch=a.out.with_name(a.out.name+'-scratch');scratch.mkdir(exist_ok=False)
    env=os.environ.copy()
    for k in ('TMP','TEMP','TMPDIR'):env[k]=str(scratch)
    env['CUPY_CACHE_DIR']=str(scratch/'cupy-cache')
    command=[sys.executable,str(Path(__file__).resolve()),'--out',str(a.out),'--backend',a.backend,'--dimension',str(a.dimension),'--trials',str(a.trials),'--worker']
    with (a.out/'worker.log').open('w',encoding='utf-8') as log:
        child=subprocess.Popen(command,env=env,stdout=log,stderr=log)
        try:code=child.wait(timeout=120)
        except subprocess.TimeoutExpired:child.kill();child.wait();write(a.out/'STOP.json',dict(error='120-second preflight stop'));raise
    if code:raise RuntimeError('Preflight failed; retain worker.log and STOP.json')
    write(a.out/'ARTIFACT-HASHES.json',{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in a.out.iterdir() if p.is_file()})
    print((a.out/'metrics.json').read_text(encoding='utf-8'))


if __name__=='__main__':main()
