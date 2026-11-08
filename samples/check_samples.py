"""Independent checks of deliberately reduced specimen data; Python standard library only."""
from pathlib import Path
import argparse,hashlib,json,math
ROOT=Path(__file__).resolve().parent
def check():
 index=json.loads((ROOT/'SAMPLES.json').read_text(encoding='utf-8'));results=[]
 assert [x['key'] for x in index['samples']]==['probability','wave','word64']
 for row in index['samples']:
  p=ROOT/row['file'];assert p.parent==ROOT and hashlib.sha256(p.read_bytes()).hexdigest()==row['sampleSha256']
  d=json.loads(p.read_text(encoding='utf-8'));n=d['angularBins'];base=d['baseBoundary'];W=d['issuedBoundary'];rho=d['outerDensity']
  assert len(base)==len(W)==len(rho)==n and all(math.isfinite(x) and x>0 for x in base)
  assert all(math.isfinite(x) and x>=0 for x in W+rho)
  ratio=[x/y for x,y in zip(W,base)];scale=sum(ratio)/n;boundary=[x/scale for x in ratio]
  field=[x/y for x,y in zip(rho,base)];scale=sum(field)/n;field=[x/scale for x in field]
  r=dict(key=d['key'],sourceExportSha256=d['sourceExportSha256'],status='passed')
  if d['key']=='probability':
   probs=d['probabilities'];assert len(probs)==n and min(probs)>=0 and abs(sum(probs)-1)<1e-12
   error=max(abs(boundary[j]/n-probs[j]) for j in range(n));assert error<1e-12
   a=.01;nextp=[(1-2*a)*probs[j]+a*(probs[j-1]+probs[(j+1)%n]) for j in range(n)]
   oldmode=sum(probs[j]*math.cos(2*math.pi*j/n) for j in range(n))
   newmode=sum(nextp[j]*math.cos(2*math.pi*j/n) for j in range(n))
   assert abs(newmode-oldmode*(1-4*a*math.sin(math.pi/n)**2))<1e-12
   r.update(boundaryRecoveryError=error,fieldBoundaryGap=max(abs(field[j]/n-probs[j]) for j in range(n)),probabilityMass=sum(nextp))
  elif d['key']=='wave':
   phase=d['issuedPhaseRadians'];pred=[1+.25*math.sin(4*math.pi*j/n-phase) for j in range(n)]
   error=max(abs(x-y) for x,y in zip(pred,boundary));assert error<1e-12
   advanced=[1+.25*math.sin(4*math.pi*j/n-phase-math.pi*.01/2) for j in range(n)]
   assert max(abs(x-y) for x,y in zip(pred,advanced))>1e-5
   r.update(boundaryRecoveryError=error,fieldBoundaryGap=max(abs(x-y) for x,y in zip(field,pred)),phaseAdvanceRadians=math.pi*.01/2)
  else:
   assert n==128
   def decode(values):
    bits=[]
    for j in range(0,128,2):
     first=values[j]/base[j];second=values[j+1]/base[j+1];assert first!=second
     bits.append(int(first>second))
    g=sum(v<<i for i,v in enumerate(bits));v=0
    while g:v^=g;g>>=1
    return v
   expected=int(d['expectedSavedWordHex'],16)
   assert decode(rho)==decode(W)==expected
   assert (int(d['exampleLeftHex'],16)-int(d['exampleRightHex'],16))%(1<<64)==expected
   r.update(recoveredWordHex=f'{expected:016x}',bits=64)
  results.append(r)
 return dict(status='passed',samples=results,scope='Reduced saved-sample checks; not full socket or growth execution',timingMeasured=False,energyMeasured=False)
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
 result=check()
 with a.out.open('x',encoding='utf-8') as f:f.write(json.dumps(result,indent=2)+'\n')
 print(json.dumps(result))
