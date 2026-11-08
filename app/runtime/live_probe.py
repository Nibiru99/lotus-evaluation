"""Bounded, paced real-device workload for live Lotus observation, not a benchmark."""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import csv
import subprocess
import os
import tempfile
import sys
import time
import traceback

import numpy as np
LAB = Path(__file__).resolve().parent
DATA = Path(os.environ['LOTUS_DATA_DIR']).resolve()
def array_hash(array):
    return hashlib.sha256(memoryview(np.ascontiguousarray(array)).cast('B')).hexdigest()

def validate(array,reference):
    ratio=float(np.max(abs(array-reference)/(1e-11+1e-12*abs(reference))))
    return bool(np.all(np.isfinite(array)) and ratio<=1),ratio
D, BATCH = 65536, 16


def run(output, jobs=60, interval=.5):
    import numpy as np
    import psutil
    output = Path(output).resolve()
    if not output.is_relative_to((DATA / 'runs').resolve()):
        raise ValueError('Live output must stay in lab runs')
    output.mkdir(parents=True, exist_ok=True)
    temporary=output/'temp';temporary.mkdir(exist_ok=True)
    os.environ['TEMP']=str(temporary);os.environ['TMP']=str(temporary)
    os.environ['CUPY_CACHE_DIR']=str(output/'cuda-cache');tempfile.tempdir=str(temporary)
    origin = time.perf_counter()
    sequence = 0
    trace = (output / 'events.jsonl').open('x', encoding='utf-8')
    series = (output/'temporal-series.csv').open('x',encoding='utf-8',newline='')
    writer=csv.writer(series);writer.writerow(['sequence','host_seconds','kind','job','source','target','bytes'])

    def emit(kind, job=None, **values):
        nonlocal sequence
        row = dict(schema='lotus.live-event/v1', session=output.name, sequence=sequence,
                   host_seconds=time.perf_counter()-origin, kind=kind, job=job, **values)
        sequence += 1
        text = json.dumps(row, allow_nan=False)
        trace.write(text+'\n'); trace.flush()
        writer.writerow([row.get(key,'') for key in ['sequence','host_seconds','kind','job','source','target','bytes']]);series.flush()
        print(text, flush=True)
        return row

    try:
        import cupy as cp
        cp.cuda.Device(0).use()
        device_pci_bus_id = cp.cuda.runtime.deviceGetPCIBusId(0)
        requested_gpu_uuid = os.environ.get('LOTUS_GPU_UUID')
        if psutil.virtual_memory().available<512*1024**2:
            raise RuntimeError('Less than 512 MiB available host memory')
        free, total = cp.cuda.runtime.memGetInfo()
        if free < 512*1024**2:
            raise RuntimeError('Less than 512 MiB free device memory; probe not started')
        pool = cp.cuda.MemoryPool(); pool.set_limit(size=128*1024**2)
        source = LAB/'simplex_map.py'
        expected=json.loads((LAB.parent/'execution-manifest.json').read_text())['mapSha256']
        if hashlib.sha256(source.read_bytes()).hexdigest()!=expected:
            raise RuntimeError('Frozen map source changed; review required')
        spec = importlib.util.spec_from_file_location('lotus_live_map', source)
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        emit('session-start', dimension=D, batch=BATCH, jobs_limit=jobs, interval_seconds=interval,
             requested_gpu_uuid=requested_gpu_uuid, device_pci_bus_id=device_pci_bus_id,
             scope='instrumented paced process only', device_name=cp.cuda.runtime.getDeviceProperties(0)['name'].decode(),
             timing_scope='Host stamps bracket instrumented calls; CUDA spans may include initial JIT/submission gaps. Synchronization and pacing make this an observation probe, not a benchmark.',
             source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
             runtime_source_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
             allocated_pool_limit_bytes=128*1024**2, free_device_bytes=free, total_device_bytes=total)
        owner_in=cp.cuda.alloc_pinned_memory(D*BATCH*8)
        owner_out=cp.cuda.alloc_pinned_memory((D+1)*BATCH*8)
        staging=np.frombuffer(owner_in,dtype=np.float64,count=D*BATCH).reshape(D,BATCH)
        readback=np.frombuffer(owner_out,dtype=np.float64,count=(D+1)*BATCH).reshape(D+1,BATCH)
        rows=[]
        with cp.cuda.using_allocator(pool.malloc):
            weights=[module.coefficients(D,cp)]
            device=cp.empty((D,BATCH),dtype=cp.float64)
            stream=cp.cuda.Stream(non_blocking=True)
            rng=np.random.default_rng(20261022)
            for job in range(jobs):
                if (output/'stop.request').exists() or time.perf_counter()-origin>40:
                    break
                if job%10==0:
                    sample=dict(cpu_process_seconds=sum(psutil.Process().cpu_times()[:2]),host_rss_bytes=psutil.Process().memory_info().rss)
                    try:
                        query=subprocess.run(['nvidia-smi','--id='+device_pci_bus_id,'--query-gpu=uuid,temperature.gpu,power.draw,utilization.gpu,memory.used','--format=csv,noheader,nounits'],capture_output=True,text=True,timeout=3,check=True)
                        fields=query.stdout.splitlines()[0].split(',')
                        measured_uuid=fields[0].strip()
                        if requested_gpu_uuid and measured_uuid != requested_gpu_uuid:
                            raise RuntimeError('GPU compute/telemetry identity mismatch')
                        sample.update(gpu_uuid=measured_uuid,device_pci_bus_id=device_pci_bus_id,gpu_temperature_c=float(fields[1]),gpu_power_w=float(fields[2]),gpu_utilization_percent=float(fields[3]),gpu_memory_mib=float(fields[4]))
                    except (OSError,ValueError,IndexError,subprocess.SubprocessError) as reason:
                        sample['gpu_monitor_unavailable']=str(reason)
                    emit('hardware-sample',**sample)
                    if sample.get('gpu_temperature_c',0)>=82:
                        raise RuntimeError('GPU temperature guard reached 82 C')
                job_start=time.perf_counter()
                emit('cpu-start',job,source='cpu',target='cpu')
                values=rng.standard_normal((D,BATCH))
                reference=module.implicit(values,[D],[module.coefficients(D,np)],np)
                digest=array_hash(values)
                chart_scale=float(max(np.max(np.abs(values[:,0])),np.max(np.abs(reference[:,0]))))
                def chart(array,stage):
                    column=array[:,0]
                    indices=np.array([j*(len(column)-1)//95 for j in range(96)],dtype=np.int64)
                    return dict(schema='lotus.simplex-chart/v1',dimension=D,column=0,sample_count=96,
                                stage=stage,job=job,indices=indices.tolist(),values=column[indices].tolist(),
                                scale=chart_scale,norm2=float(np.dot(column,column)),sum=float(np.sum(column)),
                                state_sha256=array_hash(array),
                                projection='phi=2*pi*k/n; theta=atan(value/shared_scale); torus R=1,r=.3. Coordinate samples, column 0; full arrays retained for last job.',
                                scale_source='max absolute coordinate of full CPU input/reference column 0; shared for this job')
                emit('cpu-ready',job,source='cpu',target='staging',bytes=values.nbytes,input_sha256=digest,
                     chart=chart(values,'input'))
                np.copyto(staging,values)
                staging_digest=array_hash(staging)
                if staging_digest!=digest:
                    raise RuntimeError('Pinned input copy identity failed')
                emit('staged',job,source='cpu',target='staging',bytes=staging.nbytes,
                     buffer_name='pinned-input',buffer_shape=list(staging.shape),copy_sha256=staging_digest,
                     buffer_chart=chart(staging,'input'))
                phases={}
                with stream:
                    start,end=cp.cuda.Event(),cp.cuda.Event()
                    emit('upload-start',job,source='staging',target='gpu',bytes=staging.nbytes)
                    start.record(stream);device.set(staging,stream=stream);end.record(stream);end.synchronize()
                    phases['upload_ms']=float(cp.cuda.get_elapsed_time(start,end))
                    emit('upload-done',job,source='staging',target='gpu',bytes=staging.nbytes,device_ms=phases['upload_ms'])
                    emit('kernel-start',job,source='gpu',target='gpu')
                    start.record(stream);result=module.implicit(device,[D],weights,cp);end.record(stream);end.synchronize()
                    phases['kernel_ms']=float(cp.cuda.get_elapsed_time(start,end))
                    emit('kernel-done',job,source='gpu',target='gpu',device_ms=phases['kernel_ms'])
                    emit('readback-start',job,source='gpu',target='staging',bytes=readback.nbytes)
                    start.record(stream);result.get(out=readback,stream=stream,blocking=False);end.record(stream);end.synchronize()
                    phases['read_ms']=float(cp.cuda.get_elapsed_time(start,end))
                    emit('readback-done',job,source='gpu',target='staging',bytes=readback.nbytes,device_ms=phases['read_ms'])
                emit('validation-start',job,source='staging',target='cpu')
                passed,ratio=validate(readback,reference)
                input_norm2=float(np.dot(values[:,0],values[:,0]))
                output_norm2=float(np.dot(readback[:,0],readback[:,0]))
                geometry=dict(norm_relative_error=abs(output_norm2-((D+1)/D)*input_norm2)/max(1,input_norm2),
                              zero_sum_residual=abs(float(np.sum(readback[:,0])))/max(1,output_norm2**.5))
                if max(geometry.values())>1e-8:
                    raise RuntimeError('Simplex full-column geometry invariant failed')
                row=emit('validated',job,source='staging',target='cpu',passed=passed,tolerance_ratio=ratio,
                         input_sha256=digest,output_sha256=array_hash(readback),chart=chart(readback,'output'),geometry=geometry,
                         buffer_name='pinned-readback',buffer_shape=list(readback.shape),bytes=readback.nbytes,
                         copy_sha256=array_hash(readback),buffer_chart=chart(readback,'output'),**phases)
                rows.append(row)
                if not passed:
                    raise RuntimeError('Full-output numerical gate failed')
                remaining=interval-(time.perf_counter()-job_start)
                while remaining>0 and not (output/'stop.request').exists():
                    time.sleep(min(.05,remaining));remaining=interval-(time.perf_counter()-job_start)
            stream.synchronize()
        emit('session-end',completed_jobs=len(rows),passed=all(r['passed'] for r in rows),
             stopped=(output/'stop.request').exists(),reason='bounded workload finished')
        (output/'metrics.json').write_text(json.dumps(dict(status='supported' if rows else 'unconfirmed',
            scope='live observation functionality; synchronized paced workload, not performance comparison',
            completed_jobs=len(rows),checks=rows),indent=2)+'\n',encoding='utf-8')
        if rows:
            np.savez_compressed(output/'last-packet.npz',input=values,staging_input=staging,output=readback,reference=reference)
        (output/'ascii-projection.txt').write_text('CPU -> STAGING -> GPU [MAP] -> STAGING -> CPU [CHECK]\n'+f'{len(rows)} completed jobs; 65536D x16; event log is live host observation\n',encoding='utf-8')
        (output/'REPORT.md').write_text('# Live mirror functionality run\n\n'+f'{len(rows)} complete outputs checked. This paced, synchronized workload supports UI/event observation, not a performance comparison. GPU phase times are CUDA durations; host event stamps are observed boundaries. NPZ retains only the last packet.\n',encoding='utf-8')
        (output/'NEXT-INPUT.md').write_text('Inspect the live phase events in Lotus. Arbitrary application tracing remains outside this probe.\n',encoding='utf-8')
    except Exception as error:
        emit('session-error',message=str(error))
        raise
    finally:
        trace.close()
        series.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',required=True)
    parser.add_argument('--jobs',type=int,default=60)
    args=parser.parse_args()
    if not 1<=args.jobs<=60:
        parser.error('jobs must be 1..60')
    run(args.output,args.jobs)
