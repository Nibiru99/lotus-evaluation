"""Summarize replay-admitted result folders, retaining every case and loss region."""
import argparse,csv,hashlib,json,statistics
from pathlib import Path


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('results',nargs='+',type=Path);parser.add_argument('--out',required=True,type=Path)
    args=parser.parse_args()
    if args.out.exists():raise FileExistsError('Preserve earlier summary output')
    sessions=[];sources=[];modes=set();environments=[]
    for folder in args.results:
        folder=folder.resolve();replay=folder.with_name(folder.name+'-independent-replay.json')
        r=json.loads(replay.read_text(encoding='utf-8'))
        if r['status']!='passed':raise ValueError('Independent replay required')
        hashes=json.loads((folder/'ARTIFACT-HASHES.json').read_text(encoding='utf-8'))
        for name,pin in hashes.items():
            if Path(name).name!=name or hashlib.sha256((folder/name).read_bytes()).hexdigest()!=pin:raise ValueError('Result bytes changed after replay')
        metrics=json.loads((folder/'metrics.json').read_text(encoding='utf-8'))
        modes.add(metrics['mode']);environments.append(json.loads((folder/'environment.json').read_text(encoding='utf-8')))
        with (folder/'timings.csv').open(newline='',encoding='utf-8') as f:current=list(csv.DictReader(f))
        if len(current)!=r['timed_outputs']:raise ValueError('Replay coverage mismatch')
        sessions.extend(dict(row,folder=str(folder)) for row in current)
        sources.append(dict(folder_name=folder.name,artifact_manifest_sha256=hashlib.sha256((folder/'ARTIFACT-HASHES.json').read_bytes()).hexdigest(),replay_sha256=hashlib.sha256(replay.read_bytes()).hexdigest()))
    medians=[];ratios=[]
    cases=sorted({(int(r['n']),int(r['batch'])) for r in sessions})
    for n,b in cases:
        rows=[r for r in sessions if int(r['n'])==n and int(r['batch'])==b]
        for method in sorted({r['method'] for r in rows}):
            values=[float(r['seconds']) for r in rows if r['method']==method]
            medians.append(dict(n=n,batch=b,method=method,median_s=statistics.median(values),minimum_s=min(values),maximum_s=max(values),samples=len(values)))
        for boundary in ('resident','full_io'):
            candidate='gpu_candidate_'+boundary
            for baseline in ('gpu_cupy_'+boundary,'gpu_blas_'+boundary,'cpu_pairs','cpu_blas'):
                pairs=[]
                for a in rows:
                    if a['method']!=candidate:continue
                    matches=[r for r in rows if r['method']==baseline and r['folder']==a['folder'] and r['trial']==a['trial']]
                    if len(matches)==1:pairs.append(float(matches[0]['seconds'])/float(a['seconds']))
                if pairs:ratios.append(dict(n=n,batch=b,candidate=candidate,baseline=baseline,median_baseline_over_candidate=statistics.median(pairs),minimum=min(pairs),maximum=max(pairs),pairs=len(pairs)))
    result=dict(schema='lotus.external-hardware-summary/v0.1.0',status='replayed numerical outputs; recorded timing',modes=sorted(modes),
                independently_replayed_outputs=len(sessions),run_folders=len(args.results),environments=environments,sources=sources,
                method_medians=medians,paired_ratios=ratios,energy_j=None,
                limitations='Smoke is functional admission only. Timing and hardware identity are self-reported. No host attestation, calibrated energy or server/facility gain established.')
    args.out.write_text(json.dumps(result,indent=2,allow_nan=False)+'\n',encoding='utf-8')
    print(json.dumps(dict(status=result['status'],cases=len(cases),timing_sessions=len(sessions),summary=str(args.out)),indent=2))


if __name__=='__main__':main()
