import {operatorChart} from './operator-scene.mjs';
const inputIdentity=e=>e.operator_input_sha256??e.input_sha256;
export function liveFrame(snapshot){
  if(!snapshot||!Array.isArray(snapshot.events)||snapshot.events.length>128)throw new Error('Bounded live event window required');
  const events=snapshot.events;
  for(let i=0;i<events.length;i++){const e=events[i];if(e.schema!=='lotus.live-event/v1'||!Number.isSafeInteger(e.sequence)||e.sequence<0||!Number.isFinite(e.host_seconds)||e.host_seconds<0||(i&&(e.sequence!==events[i-1].sequence+1||e.session!==events[0].session||e.host_seconds<events[i-1].host_seconds)))throw new Error('Invalid live event order');}
  const last=events.at(-1),phases=events.filter(e=>e.source&&e.target),current=phases.at(-1),sample=events.filter(e=>e.kind==='hardware-sample').at(-1);
  const operator=events.findLast(e=>e.chart);
  if(operator){operatorChart(operator.chart);if(operator.chart.job!==operator.job||operator.chart.state_sha256!==(operator.chart.stage==='input'?inputIdentity(operator):operator.output_sha256)||operator.chart.stage==='output'&&operator.passed!==true)throw new Error('Operator chart receipt mismatch');}
  const operatorPair=operator?Object.fromEntries(['input','output'].map(stage=>[stage,events.findLast(e=>e.chart?.stage===stage&&e.job===operator.job)])):null;
  if(operatorPair?.input?.operator_input_sha256&&operatorPair.output&&(operatorPair.input.packet_id!==operatorPair.output.packet_id||operatorPair.input.center_sha256!==operatorPair.output.center_sha256))throw new Error('Coordinate output lineage mismatch');
  for(const event of Object.values(operatorPair??{}))if(event){operatorChart(event.chart);if(event.chart.job!==event.job||event.chart.state_sha256!==(event.chart.stage==='input'?inputIdentity(event):event.output_sha256)||event.kind!==(event.chart.stage==='input'?'cpu-ready':'validated')||event.chart.stage==='output'&&event.passed!==true)throw new Error('Operator pair identity mismatch');}
  if(operatorPair?.input&&operatorPair.output){const a=operatorPair.input.chart,b=operatorPair.output.chart;if(a.column!==b.column||a.scale!==b.scale||Math.abs(b.norm2-(65537/65536)*a.norm2)/Math.max(1,a.norm2)>1e-8||Math.abs(b.sum)/Math.max(1,Math.sqrt(b.norm2))>1e-8)throw new Error('Simplex chart invariant failed');}
  const staging=operator?events.findLast(e=>e.buffer_chart&&e.job===operator.job):null;
  if(staging){
    const chart=staging.buffer_chart;operatorChart(chart);
    const input=chart.stage==='input',n=65536+(input?0:1),peer=operatorPair[chart.stage]?.chart;
    const coordinates=input&&staging.layout==='simplex-coordinates/v1',rows=coordinates?128:n;
    const cpu=operatorPair.input;
    if(coordinates&&(!/^[a-f0-9]{64}$/.test(staging.packet_id??'')||staging.packet_id!==cpu?.packet_id||staging.copy_sha256!==cpu?.input_sha256||!Array.isArray(staging.coordinate_axes)||staging.coordinate_axes.length!==128||staging.coordinate_axes.some((x,i,a)=>!Number.isInteger(x)||x<0||x>=65536||i>0&&x<=a[i-1])||JSON.stringify(chart.support_axes)!==JSON.stringify(staging.coordinate_axes)))throw new Error('Coordinate packet receipt mismatch');
    if(chart.job!==staging.job||staging.kind!==(input?'staged':'validated')||staging.buffer_name!==(coordinates?'pinned-coordinates':input?'pinned-input':'pinned-readback')||!input&&staging.passed!==true||staging.bytes!==rows*16*8||JSON.stringify(staging.buffer_shape)!==JSON.stringify([rows,16])||!coordinates&&staging.copy_sha256!==chart.state_sha256||!peer||peer.column!==chart.column||peer.state_sha256!==chart.state_sha256||peer.scale!==chart.scale||peer.norm2!==chart.norm2||peer.sum!==chart.sum||JSON.stringify(peer.indices)!==JSON.stringify(chart.indices)||JSON.stringify(peer.values)!==JSON.stringify(chart.values))throw new Error('Pinned buffer receipt mismatch');
  }
  return {status:snapshot.status,error:snapshot.error,run:snapshot.run,pid:snapshot.pid,metadata:snapshot.metadata,current,sample,
    operator,operatorPair,staging,
    recent:phases.filter(e=>e.host_seconds>=(last?.host_seconds??0)-1),
    completed_jobs:events.findLast(e=>e.kind==='session-end')?.completed_jobs??((events.findLast(e=>e.kind==='validated')?.job??-1)+1),
    latest_sequence:last?.sequence??null,window_first_sequence:events[0]?.sequence??null,
    scope:'Live instrumented process. Highlights show observations from the latest one-second producer window; they are not slowed transfer trajectories.',events};
}

export function drawLive(ctx,frame,points,center){
  const locate=id=>id==='lotus'?center:points.find(p=>p.id===id)?.p;
  ctx.save();
  for(const [i,event] of frame.recent.entries()){
    const a=locate(event.source),b=locate(event.target);if(!a||!b)continue;
    ctx.globalAlpha=.12+.65*(i+1)/frame.recent.length;ctx.strokeStyle=event.passed===false?'#ff6e75':'#90f0dc';ctx.lineWidth=1.6;
    if(a!==b){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
    ctx.beginPath();ctx.arc(b.x,b.y,8+(i%3)*3,0,Math.PI*2);ctx.stroke();
  }
  const current=frame.current,at=current&&locate(current.target);
  if(at){ctx.globalAlpha=1;ctx.fillStyle='#121e27';ctx.strokeStyle='#8de4d4';ctx.beginPath();ctx.arc(at.x,at.y,16,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#f0fff8';ctx.font='bold 11px ui-monospace,monospace';ctx.textAlign='center';ctx.fillText('J'+current.job,at.x,at.y+4);
    ctx.setLineDash([3,7]);ctx.strokeStyle='#c7a0ff';ctx.beginPath();ctx.moveTo(at.x,at.y);ctx.lineTo(center.x,center.y);ctx.stroke();ctx.setLineDash([]);}
  ctx.restore();
}
