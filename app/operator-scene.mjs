// Coordinate chart, not a reconstruction of the full 65,537-coordinate state.
// Torus parameterization follows ISA GlassTorusView.torusXYZ.
import {project,torusLines} from './hardware-state.mjs';
const mesh=torusLines(1,.3,48,6);
export const OPERATOR_CAMERA=Object.freeze({yaw:.35,pitch:.55});
export function operatorChart(receipt){
  if(receipt.schema!=='lotus.simplex-chart/v1'||receipt.dimension!==65536||!Number.isInteger(receipt.column)||receipt.column<0||receipt.column>=16||receipt.sample_count!==96)throw new Error('Unexpected operator chart contract');
  if(!Number.isSafeInteger(receipt.job)||receipt.job<0||!['input','output'].includes(receipt.stage))throw new Error('Invalid operator stage');
  const n=receipt.dimension+(receipt.stage==='output'?1:0);
  if(!Array.isArray(receipt.indices)||!Array.isArray(receipt.values)||receipt.indices.length!==96||receipt.values.length!==96||!Number.isFinite(receipt.scale)||receipt.scale<=0)throw new Error('Invalid operator coordinates');
  if(!/^[a-f0-9]{64}$/.test(receipt.state_sha256)||!Number.isFinite(receipt.norm2)||receipt.norm2<0||!Number.isFinite(receipt.sum))throw new Error('Missing full-state identity');
  const support=receipt.sampling==='coordinate-support/v1'?receipt.support_axes:null;
  if(receipt.sampling!==undefined&&(!support||receipt.stage!=='input'||!Array.isArray(support)||support.length!==128||support.some((x,i,a)=>!Number.isInteger(x)||x<0||x>=n||i>0&&x<=a[i-1])))throw new Error('Invalid coordinate support');
  return receipt.indices.map((index,j)=>{
    if(index!==(support?support[Math.floor(j*127/95)]:Math.floor(j*(n-1)/95))||!Number.isFinite(receipt.values[j])||Math.abs(receipt.values[j])>receipt.scale*(1+1e-12))throw new Error('Invalid sampled coordinate');
    const phi=2*Math.PI*index/n,theta=Math.atan(receipt.values[j]/receipt.scale),r=1+.3*Math.cos(theta);
    return {index,value:receipt.values[j],xyz:[r*Math.cos(phi),r*Math.sin(phi),.3*Math.sin(theta)]};
  });
}

export function projectOperatorChart(receipt,origin,size,camera=OPERATOR_CAMERA){
  const projectPoint=xyz=>{const p=project(xyz,{yaw:camera.yaw,pitch:camera.pitch,zoom:size/(620*.16)});return {...p,x:origin.x+p.x-400,y:origin.y+p.y-310};};
  return operatorChart(receipt).map((p,sample)=>({...p,...projectPoint(p.xyz),sample}));
}

export function pickOperatorSample(hits,x,y,radius=8){
  return hits.filter(p=>Math.hypot(p.x-x,p.y-y)<=radius).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y)||a.depth-b.depth)[0]??null;
}

export function drawOperator(ctx,event,points,center,selected=0,camera=OPERATOR_CAMERA,{staging=false}={}){
  const receipt=event.chart,node=points.find(p=>p.id===(staging?'staging':receipt.stage==='input'?'cpu':'gpu'));
  const hits=[];
  const render=(origin,color,size,identity)=>{
    const spatial=xyz=>{const p=project(xyz,{yaw:camera.yaw,pitch:camera.pitch,zoom:size/(620*.16)});return {...p,x:origin.x+p.x-400,y:origin.y+p.y-310};};
    ctx.save();ctx.strokeStyle=color;ctx.globalAlpha=.12;ctx.lineWidth=.6;
    for(const ring of mesh){ctx.beginPath();ring.map(spatial).forEach((p,j)=>{if(p.visible){j?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);}});ctx.stroke();}
    ctx.restore();
    const projected=projectOperatorChart(receipt,origin,size,camera);
    ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=1;ctx.beginPath();
    projected.forEach((p,j)=>{if(p.visible){j?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);}});ctx.closePath();ctx.stroke();
    for(const p of [...projected].sort((a,b)=>b.depth-a.depth)){if(!p.visible)continue;ctx.globalAlpha=p.depth>0?.45:.95;ctx.beginPath();ctx.arc(p.x,p.y,p.sample===selected?4:1.5,0,Math.PI*2);ctx.fill();hits.push({...p,stage:receipt.stage,identity,job:receipt.job,state_sha256:receipt.state_sha256});}
    const p=projected[selected];
    if(p?.visible){const phi=2*Math.PI*p.index/(receipt.dimension+(receipt.stage==='output'?1:0)),base=spatial([1.3*Math.cos(phi),1.3*Math.sin(phi),0]);ctx.globalAlpha=1;ctx.beginPath();ctx.moveTo(base.x,base.y);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.stroke();}
  };
  ctx.save();ctx.globalAlpha=.95;render(node.p,node.color,48,node.id);
  if(staging){ctx.fillStyle=node.color;ctx.font='9px ui-monospace,monospace';ctx.textAlign='center';ctx.fillText(event.buffer_name==='pinned-coordinates'?'128 COORDINATES / 16 KiB':receipt.stage==='input'?'PINNED INPUT':'PINNED READBACK',node.p.x,node.p.y+66);ctx.restore();return hits;}
  render(center,receipt.stage==='input'?node.color:'#c7a0ff',86,'lotus');
  ctx.fillStyle='#e5d6fa';ctx.font='10px ui-monospace,monospace';ctx.textAlign='right';
  const offset=receipt.stage==='input'?-30:10;
  ctx.fillText(`${receipt.stage.toUpperCase()} · column ${receipt.column} · 96/${receipt.dimension+(receipt.stage==='output'?1:0)} coordinates`,center.x-130,center.y+offset);
  ctx.fillText(`job ${receipt.job} · ‖state‖² ${receipt.norm2.toFixed(3)}`,center.x-130,center.y+offset+14);
  ctx.restore();
  return hits;
}
