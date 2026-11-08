// Display adapters extracted from manifest universe-composition:
// UnifiedUniverseView.project (Y-depth, Z-up) and renderGlassTorus geometry.
// No ISA runtime, clock, authority or job-state bindings are imported.
export const PROJECTION_SOURCE = 'fbb478428420dd88a674c4b2fad1abda2d0ac89aa4db98b347f7f48601a78e25';
export const GLYPHS = ['·','K','U','X','H','W','I','∞'];
export const DIRECTION_NAMES = ['rest_background','positive_x','negative_x','positive_y','negative_y','positive_z','negative_z','axis_forward','axis_backward'];
export const LOTUS_COLOR='#c7a0ff';
const identity = [1,0,0,0,1,0,0,0,1];
export const CORNERS = [
  {id:'cpu',name:'CPU',role:'Execution · control',color:'#8de4d4',position:[0,0,1.92],capabilities:['Host-side execution','Control and scheduling'],vector:[0.65,0.10,0.35,0.80,0.20,0.45]},
  {id:'gpu',name:'GPU',role:'Parallel compute',color:'#74b9ff',position:[-2.12,0,-1.40],capabilities:['Parallel device execution','Device memory; transfer boundary'],vector:[0.15,0.85,0.55,0.25,0.70,0.30]},
  {id:'staging',name:'RAM / staging',role:'CPU-hosted manager',color:'#edc58c',position:[2.12,0,-1.40],capabilities:['Buffer ownership and lifetime','Host-side staging and transfer preparation'],vector:[0.40,0.25,0.75,0.10,0.90,0.60]},
];
export function fixtureSnapshot() {
  return {schema:'lotus-hardware-view/v1',id:'hardware-layout-fixture-v1',mode:'fixture',producer_time:null,events:[],
    nodes:CORNERS.map(c=>({...structuredClone(c),units:'dimensionless fixture coordinates',shape:[6],dtype:'float64',
      measurements:{duration_ms:null,resident_bytes:null,energy_j:null},
      organization:[c.id,'context (fixture)','job / buffer (fixture)','item (fixture)'],
      embeddings:[{parent:c.id,child:c.id+':level1',A:identity.map(v=>v*0.40),b:[-0.22,0,0.12]},
        {parent:c.id+':level1',child:c.id+':level2',A:identity.map(v=>v*0.45),b:[0.28,0,-0.20]}]}))};
}
export function selectDimensions(vector, dimensions=[0,1,2]) {
  if (!Array.isArray(vector)||vector.length<3||vector.some(v=>!Number.isFinite(v))) throw new TypeError('Finite full vector required');
  if (dimensions.length!==3||new Set(dimensions).size!==3||dimensions.some(d=>!Number.isInteger(d)||d<0||d>=vector.length)) throw new RangeError('Choose three distinct dimensions');
  return dimensions.map(d=>vector[d]);
}
export function affine(point,A,b) {
  if(point.length!==3||A.length!==9||b.length!==3||[...point,...A,...b].some(v=>!Number.isFinite(v))) throw new TypeError('Finite 3D affine transform required');
  return b.map((offset,r)=>offset+A.slice(r*3,r*3+3).reduce((sum,v,c)=>sum+v*point[c],0));
}
export function nestedPoint(node,dimensions,depth) {
  let point=selectDimensions(node.vector,dimensions);
  if(!Number.isInteger(depth)||depth<0||depth>node.embeddings.length) throw new RangeError('Invalid nesting depth');
  for(let i=depth-1;i>=0;i--) point=affine(point,node.embeddings[i].A,node.embeddings[i].b);
  return point.map((v,i)=>v+node.position[i]);
}
export function project(point,{width=800,height=620,yaw=0,pitch=0,zoom=1}={}) {
  if(point.length!==3||[...point,width,height,yaw,pitch,zoom].some(v=>!Number.isFinite(v))||width<=0||height<=0||zoom<=0) throw new TypeError('Finite camera parameters required');
  const [x,y,z]=point,rx=x*Math.cos(yaw)-y*Math.sin(yaw),ry=x*Math.sin(yaw)+y*Math.cos(yaw);
  const depth=ry*Math.cos(pitch)-z*Math.sin(pitch),up=ry*Math.sin(pitch)+z*Math.cos(pitch);
  const effZ=9+depth,scale=9/Math.max(0.2,effZ),base=Math.min(width,height)*0.16*zoom;
  return {x:width/2+rx*base*scale,y:height/2-up*base*scale,depth,visible:effZ>0.5};
}
export function torusLines(major=0.63,minor=0.10,segments=32,rings=8) {
  if(!Number.isFinite(major)||!Number.isFinite(minor)||major<=0||minor<=0||!Number.isInteger(segments)||segments<3||segments>128||!Number.isInteger(rings)||rings<3||rings>32) throw new RangeError('Invalid bounded torus geometry');
  return Array.from({length:rings},(_,k)=>Array.from({length:segments+1},(_,i)=>{
    const phi=i/segments*Math.PI*2,theta=k/rings*Math.PI*2;
    return [(major+minor*Math.cos(theta))*Math.cos(phi),(major+minor*Math.cos(theta))*Math.sin(phi),minor*Math.sin(theta)];
  }));
}
export function validateSnapshot(snapshot) {
  if(snapshot?.schema!=='lotus-hardware-view/v1'||!['fixture','recorded','live calculation'].includes(snapshot.mode)||!Array.isArray(snapshot.nodes)||snapshot.nodes.length!==3) throw new TypeError('Invalid hardware snapshot');
  if(new Set(snapshot.nodes.map(n=>n.id)).size!==3||CORNERS.some(c=>!snapshot.nodes.some(n=>n.id===c.id))) throw new TypeError('Persistent corner identities required');
  for(const node of snapshot.nodes) {
    selectDimensions(node.vector); project(node.position);
    if(node.vector.length>65536||typeof node.units!=='string'||typeof node.dtype!=='string'||!Array.isArray(node.organization)||node.organization.some(v=>typeof v!=='string')) throw new TypeError('Bounded vector, units, dtype and organization required');
    if(node.shape?.length!==1||node.shape[0]!==node.vector.length||!Array.isArray(node.embeddings)||node.embeddings.length!==2) throw new TypeError('Shape or nesting contract mismatch');
    node.embeddings.forEach((e,i)=>{affine([0,0,0],e.A,e.b);if(e.parent!==(i?node.embeddings[i-1].child:node.id)||typeof e.child!=='string')throw new TypeError('Broken parent-child embedding chain');});
  }
  if(!Array.isArray(snapshot.events)) throw new TypeError('Explicit event list required');
  return structuredClone(snapshot);
}
