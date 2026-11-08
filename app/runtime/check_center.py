"""Independent reduced-receipt checks; standard library, no private backend imports."""
import argparse,json,math,hashlib,struct
from pathlib import Path
def verify(d):
 allowed={'schema','key','cases','sourceFinding','sourceExportHash','sourceInitialTime','execution','recoveryAfterJob','recoveryFollowups','fullRecoveryMatched','initialStateHash','finalStateHash','hardwareAccelerationTested'}
 if set(d)!=allowed or d['schema']!='lotus.single-center-evaluation/1' or d['key'] not in ('probability','wave','word64'):raise ValueError('Unexpected receipt')
 if d['hardwareAccelerationTested'] is not False or d['fullRecoveryMatched'] is not True or d['recoveryAfterJob']!=1 or d['recoveryFollowups']!=2:raise ValueError('Execution/recovery scope mismatch')
 if len(d['cases'])!=4:raise ValueError('Four complete cases required')
 result=[];elapsed=0;previous=d['sourceInitialTime']
 for j,c in enumerate(d['cases']):
  if set(c)!={'job','input','output','sourceTimeBefore','sourceTimeAfter','transport'} or c['job']!=j:raise ValueError('Unexpected case fields')
  i=c['input'];o=c['output'];steps=i.get('steps',1);elapsed+=steps*.01
  if not all(math.isfinite(v) for v in (previous,c['sourceTimeBefore'],c['sourceTimeAfter'])) or abs(c['sourceTimeBefore']-previous)>1e-12:raise ValueError('Source clock continuity mismatch')
  previous=c['sourceTimeAfter']
  if abs(c['sourceTimeAfter']-d['sourceInitialTime']-elapsed)>1e-12:raise ValueError('Source clock mismatch')
  transport=c['transport'];expected_input=16 if d['key']=='word64' else 576 if d['key']=='probability' else 4
  expected_output=64 if d['key']=='word64' else 576
  if set(transport)!={'kind','byteOrder','inputBytes','outputBytes','inputSha256','outputSha256','hostCopies','gpuDispatched'} or transport['kind']!='ordinary-host-staging' or transport['byteOrder']!='little' or transport['inputBytes']!=expected_input or transport['outputBytes']!=expected_output or transport['hostCopies']!=2 or transport['gpuDispatched'] is not False:raise ValueError('Host buffer scope mismatch')
  if any(not isinstance(transport[k],str) or len(transport[k])!=64 or any(v not in '0123456789abcdef' for v in transport[k]) for k in ('inputSha256','outputSha256')):raise ValueError('Missing buffer identity')
  error=0
  if d['key']=='word64':
   a=int(i['leftHex'],16);b=int(i['rightHex'],16);expected=(a-b)%(1<<64)
   bits=o['resultBits']
   if len(bits)!=64 or any(v not in (0,1) for v in bits):raise ValueError('Invalid word bits')
   if sum(v<<k for k,v in enumerate(bits))!=expected or bits!=o['postSourceBits'] or o['borrow']!=int(a<b):raise ValueError('Wrong word result')
   label=f'{expected:016x}'
  elif d['key']=='probability':
   p=i['probabilities']
   if len(p)!=72:raise ValueError('Native probability grid required')
   for _ in range(steps):p=[.998*v+.001*(p[(k-1)%72]+p[(k+1)%72]) for k,v in enumerate(p)]
   if len(o['probabilities'])!=72:raise ValueError('Native probability output grid required')
   error=max(abs(x-y) for x,y in zip(p,o['probabilities']))
   if abs(sum(p)-1)>1e-12:raise ValueError('Probability mass mismatch')
   label='mass '+f'{sum(p):.12f}'
  else:
   if o['angularBins']!=72 or len(o['normalizedBoundary'])!=72:raise ValueError('Native wave grid required')
   t=d['sourceInitialTime']+elapsed-.01;v=o['normalizedBoundary'];mean=sum(v)/72
   error=max(abs(x/mean-(1+.25*math.sin(4*math.pi*k/72-math.pi*t/2))) for k,x in enumerate(v));label='phase @ '+f'{t:.5f}'
  if not math.isfinite(error) or error>1e-12:raise ValueError('Numerical result mismatch')
  input_raw=struct.pack('<QQ',int(i['leftHex'],16),int(i['rightHex'],16)) if d['key']=='word64' else struct.pack('<72d',*i['probabilities']) if d['key']=='probability' else struct.pack('<I',steps)
  output_raw=bytes(o['postSourceBits']) if d['key']=='word64' else struct.pack('<72d',*(o['probabilities'] if d['key']=='probability' else o['normalizedBoundary']))
  if hashlib.sha256(input_raw).hexdigest()!=transport['inputSha256'] or hashlib.sha256(output_raw).hexdigest()!=transport['outputSha256']:raise ValueError('Host buffer identity mismatch')
  result.append(dict(job=j,result=label,error=error,sourceTime=c['sourceTimeAfter']))
 return dict(status='passed',key=d['key'],cases=4,rows=result,recoveryFollowups=2,fullRecoveryMatched=True,hardwareAccelerationTested=False)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('receipt',type=Path);a=p.parse_args();print(json.dumps(verify(json.loads(a.receipt.read_text(encoding='utf-8')))))
