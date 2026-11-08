// Finite rational circle chart, followed by explicit binary64 scale evaluation.
// Convention matches the quarter-chart in ISA benchmark_angular_metric.py.
export const CIRCLE_OPERATOR = 'lotus.canonical-circle/v1';
const admittedReferences=new WeakSet();

function gcd(a,b) { while(b!==0n){const next=a%b;a=b;b=next;}return a<0n?-a:a; }
function freeze(value) {
  for(const child of Object.values(value))if(child&&typeof child==='object'&&!Object.isFrozen(child))freeze(child);
  return Object.freeze(value);
}

export function canonicalCircle({numerator=1,denominator=2,quadrant=0}={}) {
  if(!Number.isSafeInteger(denominator)||denominator<1||denominator>1000000||
     !Number.isSafeInteger(numerator)||numerator<0||numerator>denominator||
     !Number.isInteger(quadrant)||quadrant<0||quadrant>3)throw new RangeError('Use 0 ≤ numerator ≤ denominator ≤ 1,000,000 and quadrant 0–3');
  const p=BigInt(numerator),q=BigInt(denominator),d=p*p+q*q;
  const a=q*q-p*p,b=2n*p*q;
  let [x,y]=[[a,b],[-b,a],[-a,-b],[b,-a]][quadrant];
  const common=gcd(gcd(x,y),d),den=d/common;x/=common;y/=common;
  if(x*x+y*y!==den*den)throw new Error('Exact circle identity failed');
  const unit=[Number(x)/Number(den),Number(y)/Number(den)];
  const reference=freeze({operator:CIRCLE_OPERATOR,chart:{numerator,denominator,quadrant},
    reference_id:`circle:${x},${y}/${den}`,exact:{x:String(x),y:String(y),denominator:String(den),unit_circle:true},
    unit_point:unit,unit_tangent:[-unit[1],unit[0]],
    parameter_convention:'t=p/q in one quadrant; angle=quadrant*π/2 + 2*atan(t)',
    coordinate_units:'dimensionless',arithmetic:'BigInt exact reference; binary64 evaluated coordinates'});
  admittedReferences.add(reference);return reference;
}

export function evaluateCircle(reference,{radius=1,revision=0}={}) {
  if(reference?.operator!==CIRCLE_OPERATOR)throw new TypeError('Canonical circle reference required');
  // Factory-owned frozen records can be reused without reconstructing their chart.
  if(!admittedReferences.has(reference))throw new TypeError('Reference descriptor mismatch; reconstruct through canonicalCircle');
  if(!Number.isFinite(radius)||radius<1e-12||radius>1e12)throw new RangeError('Radius must be between 1e-12 and 1e12 model length units');
  if(!Number.isSafeInteger(revision)||revision<0)throw new RangeError('Nonnegative logical revision required');
  const point=reference.unit_point.map(v=>radius*v),curvature=1/radius;
  return freeze({schema:'lotus.canonical-geometry-state/v1',operator:CIRCLE_OPERATOR,mode:'local calculation',
    revision,simulation_time:null,reference_id:reference.reference_id,reference,
    input:{radius,chart:reference.chart},output:{point,tangent:reference.unit_tangent,curvature},
    units:{point:'model length',tangent:'dimensionless unit direction',curvature:'1 / model length'},
    residuals:{normalized_radius:Math.abs(Math.hypot(...point.map(v=>v/radius))-1),
      tangent_norm:Math.abs(Math.hypot(...reference.unit_tangent)-1),
      curvature_scaling:Math.abs(curvature*radius-1)},
    display_projection:'normalized unit chart; radius and curvature retained in raw state'});
}
