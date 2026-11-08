import './hardware-view.mjs';
import {CORNERS,project} from './hardware-state.mjs';
import {liveFrame,drawLive} from './live-scene.mjs';
import {drawOperator,OPERATOR_CAMERA,pickOperatorSample} from './operator-scene.mjs';

// Reuse the original projection, chart validation and drawing functions.
// This module wires their reduced evaluation controls; it implements no map arithmetic.
const $=id=>document.getElementById(id),api=window.lotus;
for(const button of document.querySelectorAll('[data-view]'))button.onclick=()=>{
  const name=button.dataset.view;
  for(const section of document.querySelectorAll('.page'))section.hidden=section.id!=='view-'+name;
  for(const item of document.querySelectorAll('[data-view]'))item.setAttribute('aria-current',item===button?'page':'false');
};
const stage=$('hw-map').parentElement,surface=document.createElement('div');
surface.id='hw-composition-surface';surface.dataset.sceneMode='live';
const canvas=document.createElement('canvas');canvas.id='hw-composition';canvas.width=1200;canvas.height=930;
canvas.setAttribute('aria-label','Original Lotus live input, output and staging coordinate renderer');
stage.insertBefore(surface,$('hw-map'));surface.append(canvas,$('hw-map'));stage.classList.add('hw-composed');
const controls=document.createElement('div');controls.className='hw-controls';
controls.innerHTML='<label>Workload <select id="eval-producer"><option value="dense-reference">Dense reference</option></select></label><button id="eval-run" class="secondary">Run workload</button><button id="eval-stop" class="secondary" disabled>Stop</button><label>Coordinate <select id="eval-coordinate"></select></label>';
surface.before(controls);
for(let i=0;i<96;i++){const option=document.createElement('option');option.value=i;option.textContent=i;$('eval-coordinate').append(option);}
const inspector=document.createElement('section');
inspector.innerHTML='<h3>Live instrumented hardware</h3><p id="eval-status" role="status">Ready. No workload started.</p><pre id="eval-values"></pre><p>65,536D / batch16. Full-output numerical checks; this chart samples96 coordinates. Paced observation is separate from comparative performance testing.</p>';
document.querySelector('.hw-inspector').prepend(inspector);
const points=CORNERS.map(c=>({...c,p:project(c.position)})),center=project([0,0,.10]),ctx=canvas.getContext('2d');
let frame=null,hits=[],busy=false,disposed=false;
function draw(){
  ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.scale(1.5,1.5);
  hits=[];if(!frame)return;
  drawLive(ctx,frame,points,center);
  if(frame.operatorPair){
    const selected=Number($('eval-coordinate').value);
    for(const event of Object.values(frame.operatorPair))if(event)hits.push(...drawOperator(ctx,event,points,center,selected,OPERATOR_CAMERA));
    if(frame.staging)hits.push(...drawOperator(ctx,{...frame.staging,chart:frame.staging.buffer_chart},points,center,selected,OPERATOR_CAMERA,{staging:true}));
    $('eval-values').textContent=Object.entries(frame.operatorPair).filter(([,event])=>event).map(([label,event])=>`${label.toUpperCase()} / job${event.job}\nindex=${event.chart.indices[selected]}\nvalue=${event.chart.values[selected]}\nfull-column norm²=${event.chart.norm2}\n${event.geometry?'norm residual='+event.geometry.norm_relative_error+' / sum residual='+event.geometry.zero_sum_residual:''}`).join('\n\n');
  }
}
async function refresh(){
  if(busy||disposed)return;busy=true;
  try{
    const state=await api.liveStatus();if(disposed)return;
    if(state.integrity!=='passed')throw Error('Execution source integrity check failed');
    frame=liveFrame(state);const active=['starting','running','stopping'].includes(state.status);
    $('eval-run').disabled=active;$('eval-stop').disabled=!active;$('eval-producer').disabled=active;
    $('hw-mode').textContent='LIVE OPERATOR / ROLE LAYOUT';
    $('eval-status').textContent=`${state.status.toUpperCase()} · ${frame.completed_jobs} completed jobs${frame.sample?.gpu_power_w!==undefined?' · last GPU board sample '+frame.sample.gpu_power_w+' W':''}. Source integrity checked. ${state.error||''}`;
    draw();
  }catch(error){$('eval-status').textContent=error.message;$('eval-run').disabled=true;}
  finally{busy=false;}
}
$('eval-run').onclick=async()=>{
  $('eval-run').disabled=true;
  try{const selected=document.querySelector('[data-hardware-gpu]')?.value,options={producer:$('eval-producer').value};
    if(selected){if(!selected.startsWith('GPU-'))throw Error('Selected adapter has no admitted CUDA execution path');options.gpuUuid=selected;}
    await api.startLive(options);await refresh();
  }catch(error){$('eval-status').textContent=error.message;$('eval-run').disabled=false;}
};
$('eval-stop').onclick=async()=>{await api.stopLive();await refresh();};
$('eval-coordinate').onchange=draw;
$('hw-map').addEventListener('click',event=>{
  const rect=canvas.getBoundingClientRect(),hit=pickOperatorSample(hits,(event.clientX-rect.left)*800/rect.width,(event.clientY-rect.top)*620/rect.height);
  if(hit){$('eval-coordinate').value=hit.sample;draw();}
});
const timer=setInterval(refresh,200);
window.addEventListener('pagehide',()=>{disposed=true;clearInterval(timer);},{once:true});
window.lotusEvaluation={ready:refresh(),refresh};
