import {CORNERS,fixtureSnapshot,validateSnapshot,selectDimensions,nestedPoint,project,torusLines,PROJECTION_SOURCE,GLYPHS,DIRECTION_NAMES,LOTUS_COLOR} from './hardware-state.mjs';
import {canonicalCircle,evaluateCircle} from './canonical-circle.mjs';

const host=document.getElementById('view-observatory');
const section=document.createElement('section');section.className='hw-section';section.id='hardware-triangle';
section.innerHTML=`<div class="hw-heading"><div><div class="eyebrow">LOTUS / HARDWARE CONSTELLATION</div><h2>Three roles. One shared view.</h2><p>CPU, GPU and the CPU-hosted staging manager retain their identities. Select a corner to inspect its full state, nesting and projection.</p></div><span id="hw-mode" class="hw-tag">LAYOUT FIXTURE · NOT TELEMETRY</span></div>
<div class="hw-workbench"><div><div class="hw-stage"><svg id="hw-map" viewBox="0 0 800 620" role="group" aria-label="Hardware triangle with distinct central Lotus. Tab to a node, Enter to select; arrow keys move between nodes."></svg><div class="hw-controls"><button id="hw-motion" type="button" class="secondary" aria-pressed="false">Animate display rings</button><label><input id="hw-rings" type="checkbox" checked> Torus scaffolds</label><label><input id="hw-nesting" type="checkbox" checked> Affine nesting</label><button id="hw-reset" class="quiet-button" type="button">Reset view</button></div><div class="hw-legend"><strong>Dashed links</strong> = proposed connections · <strong>small dots</strong> = projected fixture vectors<br>Ring animation uses display time only. No transport, workload or velocity is inferred.</div></div><div id="hw-status" class="hw-status hw-live-region" role="status"></div><div id="hw-evidence" class="hw-below">Recorded hardware evidence: not connected. Timing, energy and maximum capacity are unavailable here.</div></div><aside class="hw-inspector" aria-label="Selected hardware state"><div class="eyebrow">EXTERNAL INSPECTOR / FULL STATE</div><div id="hw-selection" aria-live="polite"></div><div id="hw-source-links" class="hw-source-links"></div></aside></div>
<p class="hw-below">Projected coordinates display selected values; full-array checks are performed by the workload. Fixture controls are local geometry illustrations.</p>`;
host.prepend(section);
const hardwareCapabilities=document.getElementById('hardware-capabilities');
if(hardwareCapabilities)section.querySelector('.hw-heading').after(hardwareCapabilities);
const $=id=>document.getElementById(id),make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const svg=(tag,attrs={},text)=>{const e=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;return e;};
let snapshot=validateSnapshot(fixtureSnapshot()),selection='lotus',depth=0,dimensions=[0,1,2],page=0,angle=0,frame=null,last=null,disposed=false;
const ringGeometry=torusLines(),nodeOrder=['cpu','gpu','staging','lotus'],positions=new Map(CORNERS.map(c=>[c.id,project(c.position)]));
positions.set('lotus',project([0,0,0.10]));
let canonical=canonicalCircle(),geometryState=evaluateCircle(canonical),geometryBuilds=1,operatorSource=null,preparedLayerReceipt=null;
const geometryControls=make('div',undefined,'hw-below');geometryControls.id='hw-canonical-controls';
geometryControls.innerHTML=`<h3>Canonical geometry · local calculation</h3><p>Quarter-chart t = p/q. Step the rational chart or change scale; the center shows a normalized projection. Scale-only edits reuse the same exact reference.</p><div class="hw-toolbar"><label>p <input id="hw-circle-p" type="number" min="0" max="1000000" value="1" aria-label="Circle chart numerator"></label><label>q <input id="hw-circle-q" type="number" min="1" max="1000000" value="2" aria-label="Circle chart denominator"></label><label>Quadrant <select id="hw-circle-quadrant" aria-label="Circle quadrant"><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label><label>Radius <input id="hw-circle-radius" type="number" min="0.000000000001" max="1000000000000" step="any" value="1" aria-label="Circle radius in model length units"></label><button id="hw-circle-step" type="button" class="secondary">Step chart</button></div><p id="hw-circle-status" role="status"></p>`;
$('hw-evidence').before(geometryControls);
$('hw-mode').textContent='ROLE FIXTURES · CENTER CALCULATED';
function canonicalState() {return {...structuredClone(geometryState),canonical_builds:geometryBuilds,source:operatorSource??{status:'source index not yet read'},prepared_layer_receipt:structuredClone(preparedLayerReceipt)};}
document.addEventListener('lotus:prepared-layer',event=>{preparedLayerReceipt=structuredClone(event.detail);inspect();});
function updateGeometry() {
  try {
    if(['hw-circle-p','hw-circle-q','hw-circle-radius'].some(id=>$(id).value.trim()===''))throw new RangeError('Complete all geometry inputs');
    const chart={numerator:Number($('hw-circle-p').value),denominator:Number($('hw-circle-q').value),quadrant:Number($('hw-circle-quadrant').value)};
    const reused=Object.keys(chart).every(key=>chart[key]===canonical.chart[key]);
    const candidate=reused?canonical:canonicalCircle(chart);
    const next=evaluateCircle(candidate,{radius:Number($('hw-circle-radius').value),revision:geometryState.revision+1});
    canonical=candidate;geometryState=next;if(!reused)geometryBuilds++;
    $('hw-circle-status').textContent=`Revision ${next.revision} · ${reused?'canonical reference reused':'new canonical chart'} · curvature ${next.output.curvature} / model length`;
    draw();inspect();
  } catch(error){$('hw-circle-status').textContent=error.message+'; previous valid state retained.';}
}
for(const id of ['hw-circle-p','hw-circle-q','hw-circle-quadrant','hw-circle-radius'])$(id).addEventListener('change',updateGeometry);
$('hw-circle-step').onclick=()=>{
  if(['hw-circle-p','hw-circle-q'].some(id=>$(id).value.trim()==='')){updateGeometry();return;}
  const p=Number($('hw-circle-p').value),q=Number($('hw-circle-q').value);
  if(!Number.isInteger(p)||!Number.isInteger(q)||p<0||p>q||q<1){updateGeometry();return;}
  if(p<q)$('hw-circle-p').value=String(p+1);
  else {$('hw-circle-p').value='1';$('hw-circle-quadrant').value=String((Number($('hw-circle-quadrant').value)+1)%4);}
  updateGeometry();
};
let manifest=null;
let recordedReceipt=null;
function showRecordedReceipt() {
  const map=$('hw-map');map.querySelector('#hw-recorded-receipt')?.remove();
  if(!recordedReceipt)return;
  const center=positions.get('lotus'),event=recordedReceipt.event;
  map.append(svg('text',{id:'hw-recorded-receipt',x:center.x,y:center.y+132,'text-anchor':'middle',fill:'#8de4d4','font-size':9},`RECORDED · job ${event.job} · ${event.kind} · ${event.time_seconds.toFixed(3)} s`));
}
const projectionText='P selects dimensions ['+dimensions.join(', ')+']; remaining coordinates are omitted from position, retained in inspection.';

function sourceLinks() { $('hw-source-links').replaceChildren(); }

function select(id,newDepth=0,focus=false) {
  if(!nodeOrder.includes(id))return;
  selection=id;depth=newDepth;page=0;draw();inspect();
  if(focus)$('hw-map').querySelector('[data-hardware="'+id+'"]')?.focus();
}
function draw() {
  const map=$('hw-map');map.replaceChildren();
  const p=CORNERS.map(c=>positions.get(c.id));
  map.append(svg('path',{d:`M${p[0].x},${p[0].y} L${p[1].x},${p[1].y} L${p[2].x},${p[2].y} Z`,class:'hw-outer'}));
  map.append(svg('text',{x:30,y:32,fill:'#6e8a9c','font-size':10},'01 / IDENTITY & REPRESENTATION'));
  map.append(svg('text',{id:'hw-fixture-caption',x:30,y:590,fill:'#8da5b6','font-size':10},snapshot.mode.toUpperCase()+' · PRODUCER TIME '+(snapshot.producer_time??'UNKNOWN')));
  const center=positions.get('lotus');
  for(const c of CORNERS) {
    const pos=positions.get(c.id);
    map.append(svg('line',{x1:pos.x,y1:pos.y,x2:center.x,y2:center.y,class:'hw-link'}));
    if($('hw-rings').checked) {
      const ring=svg('g',{'data-ring':c.id,opacity:.35});
      for(const line of ringGeometry) {
        const points=line.map(pt=>project([pt[0]+c.position[0],pt[2]+c.position[1],pt[1]+c.position[2]]));
        ring.append(svg('path',{d:points.map((pt,i)=>(i?'L':'M')+pt.x+','+pt.y).join(' '),fill:'none',stroke:c.color,'stroke-width':.65}));
      }
      map.append(ring);
    }
  }
  for(const id of nodeOrder) {
    const c=CORNERS.find(n=>n.id===id),pos=positions.get(id),color=c?.color??LOTUS_COLOR;
    const group=svg('g',{class:'hw-node'+(selection===id?' selected':''),'data-hardware':id,role:'button',tabindex:0,'aria-pressed':String(selection===id),'aria-label':(c?.name??'Lotus')+' · '+(c?.role??'Proposed software coordination role')});
    group.append(svg('circle',{cx:pos.x,cy:pos.y,r:id==='lotus'?39:43,stroke:color}));
    group.append(svg('text',{x:pos.x,y:pos.y+8,'text-anchor':'middle',fill:color,class:'hw-mark'},({cpu:'Σ',gpu:'∥',staging:'▦',lotus:'✳'})[id]));
    group.append(svg('text',{x:pos.x,y:pos.y+(id==='cpu'?-83:92),'text-anchor':'middle',class:'hw-name'},c?.name??'LOTUS'));
    group.append(svg('text',{x:pos.x,y:pos.y+(id==='cpu'?-64:111),'text-anchor':'middle',class:'hw-role'},c?.role??'Canonical reference · local calculation'));
    if(id==='lotus') {
      const [x,y]=geometryState.reference.unit_point,[tx,ty]=geometryState.output.tangent;
      const px=pos.x+28*x,py=pos.y-28*y;
      group.append(svg('circle',{cx:pos.x,cy:pos.y,r:28,fill:'none',stroke:'#8de4d4','stroke-width':.7}));
      group.append(svg('line',{x1:pos.x,y1:pos.y,x2:px,y2:py,stroke:'#8de4d4','stroke-width':1}));
      group.append(svg('line',{x1:px,y1:py,x2:px+8*tx,y2:py-8*ty,stroke:'#edc58c','stroke-width':2}));
      group.append(svg('circle',{id:'hw-canonical-point',cx:px,cy:py,r:3,fill:'#8de4d4',stroke:'#8de4d4'}));
      map.append(svg('text',{id:'hw-canonical-caption',x:pos.x,y:pos.y-58,'text-anchor':'middle',fill:'#8de4d4','font-size':9},'UNIT CHART · POINT + TANGENT'));
    }
    group.addEventListener('click',()=>select(id));
    group.addEventListener('keydown',event=>{
      if(['Enter',' '].includes(event.key)){event.preventDefault();select(id,0,true);}
      if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const offset=['ArrowLeft','ArrowUp'].includes(event.key)?-1:1;select(nodeOrder[(nodeOrder.indexOf(id)+offset+4)%4],0,true);}
    });map.append(group);
    if(c&&$('hw-nesting').checked) {
      const node=snapshot.nodes.find(n=>n.id===id);
      for(let d=1;d<=2;d++) {
        const dot=project(nestedPoint(node,dimensions,d));
        map.append(svg('line',{'data-affine':'true',x1:pos.x,y1:pos.y,x2:dot.x,y2:dot.y,stroke:color,opacity:.6,'stroke-width':1}));
        const marker=svg('circle',{'data-affine':'true',cx:dot.x,cy:dot.y,r:selection===id&&depth===d?6:4,fill:color,stroke:'#0b1420','stroke-width':1,role:'button',tabindex:0,'aria-label':c.name+' affine nesting level '+d});
        marker.addEventListener('click',()=>select(id,d));
        marker.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(id,d);}});
        map.append(marker);
      }
    }
  }
  updateRings();
  showRecordedReceipt();
}
function inspect() {
  document.dispatchEvent(new CustomEvent('lotus:hardware-selection'));
  const panel=$('hw-selection');panel.replaceChildren();
  if(selection==='lotus') {
    panel.append(make('h3','Lotus'),make('span','LOCAL CANONICAL GEOMETRY','hw-tag'),make('p','The center now evaluates point, unit tangent and curvature from an immutable rational reference. Radius uses model length units; the drawing retains a normalized unit chart.'),make('p','The hardware corners retain their separately labelled fixtures. Coordination and sandbox execution remain future branches.'));
    const format=value=>Number(value.toPrecision(8)).toString();
    panel.append(make('p','Point: ('+geometryState.output.point.map(format).join(', ')+') model length'),
      make('p','Unit tangent: ('+geometryState.output.tangent.map(format).join(', ')+')'),
      make('p','Curvature: '+format(geometryState.output.curvature)+' / model length'),
      make('p','Radius residual: '+format(geometryState.residuals.normalized_radius)+' · logical revision '+geometryState.revision,'hw-small'));
    const inputs=make('button','Geometry inputs','source-link');inputs.onclick=()=>geometryControls.scrollIntoView({block:'center'});panel.append(inputs);
    panel.append(make('pre',JSON.stringify(canonicalState(),null,2)));
    panel.append(make('p',snapshot.events.length+' events in the hardware-role snapshot. Recorded transport uses its own source-bound panel.','hw-small'));
    if(snapshot.events.length){const raw=make('pre',JSON.stringify(snapshot.events.slice(0,20),null,2));panel.append(make('p','First 20 raw events; receipt interpretation is not connected.'),raw);}
    return;
  }
  const node=snapshot.nodes.find(n=>n.id===selection),c=CORNERS.find(n=>n.id===selection);
  panel.append(make('h3',c.name),make('span',snapshot.mode.toUpperCase()+' · '+node.shape[0]+'D','hw-tag'),make('p',c.role));
  const list=make('ul');c.capabilities.forEach(text=>list.append(make('li',text)));panel.append(list);
  panel.append(make('p','Duration: '+(node.measurements?.duration_ms??'unavailable')+' · energy: '+(node.measurements?.energy_j??'unavailable')+' · resident bytes: '+(node.measurements?.resident_bytes??'unavailable'),'hw-small'));
  const levels=make('div',undefined,'hw-selectors');
  for(let d=0;d<=2;d++){const button=make('button',d?'Level '+d:'Full vector');button.type='button';button.setAttribute('aria-pressed',String(depth===d));button.onclick=()=>select(selection,d);levels.append(button);}panel.append(levels);
  panel.append(make('p','Organizational containment: '+node.organization.join(' → '),'hw-small'));
  const inputs=make('div',undefined,'hw-dimensions');
  dimensions.forEach((dimension,i)=>{const label=make('label',['X','Y','Z'][i]+' dimension'),input=make('input');input.type='number';input.min='0';input.max=String(node.vector.length-1);input.value=String(dimension);input.style.width='64px';input.setAttribute('aria-label',['X','Y','Z'][i]+' projection dimension');
    input.onchange=()=>{const next=[...dimensions];next[i]=Number(input.value);try{selectDimensions(node.vector,next);dimensions=next;draw();inspect();$('hw-status').textContent='Projection changed; full state is unchanged.';}catch(error){input.value=String(dimensions[i]);$('hw-status').textContent=error.message;}};label.append(input);inputs.append(label);});panel.append(inputs);
  const start=page*32;panel.append(make('p',`Full vector · indices ${start}–${Math.min(node.vector.length-1,start+31)} / ${node.vector.length} values · ${node.dtype} · ${node.units}`,'hw-small'));
  panel.append(make('pre',node.vector.slice(start,start+32).map((v,i)=>`[${i+start}] ${v}`).join('\n')));
  if(node.vector.length>32){const pages=make('div',undefined,'hw-toolbar');for(const [text,delta] of [['Previous values',-1],['Next values',1]]){const b=make('button',text);b.disabled=page+delta<0||(page+delta)*32>=node.vector.length;b.onclick=()=>{page+=delta;inspect();};pages.append(b);}panel.append(pages);}
  const details=make('details'),summary=make('summary','Projection, transforms & information loss');details.append(summary,make('pre',JSON.stringify({operator:'dimension-selection/v1',dimensions,projected:selectDimensions(node.vector,dimensions),omitted:node.vector.length-3,retained:'Full vector available in pages above',depth,world_point:nestedPoint(node,dimensions,depth),embedding_order:'outer(inner(P(vector)))',embeddings:node.embeddings,producer_time:snapshot.producer_time,source_hash:PROJECTION_SOURCE},null,2)));panel.append(details);
}
function updateRings(){for(const [id,pos] of positions){const ring=$('hw-map').querySelector('[data-ring="'+id+'"]');if(ring)ring.setAttribute('transform',`rotate(${angle} ${pos.x} ${pos.y})`);}}
function stop(){if(frame!==null)cancelAnimationFrame(frame);frame=null;last=null;$('hw-motion').textContent='Animate display rings';$('hw-motion').setAttribute('aria-pressed','false');}
function tick(now){if(disposed||document.hidden||host.hidden){stop();return;}if(last===null)last=now;if(now-last>=1000/30){angle=(angle+Math.min(now-last,100)*.008)%360;last=now;updateRings();}frame=requestAnimationFrame(tick);}
$('hw-motion').onclick=()=>{if(frame!==null){stop();return;}if(matchMedia('(prefers-reduced-motion: reduce)').matches){$('hw-status').textContent='Reduced motion is enabled; static inspection remains available.';return;}$('hw-motion').textContent='Pause display rings';$('hw-motion').setAttribute('aria-pressed','true');frame=requestAnimationFrame(tick);};
$('hw-rings').onchange=draw;$('hw-nesting').onchange=draw;
$('hw-reset').onclick=()=>{stop();angle=0;dimensions=[0,1,2];select('cpu');};
const visibility=()=>{if(document.hidden)stop();};document.addEventListener('visibilitychange',visibility);
const observer=new MutationObserver(()=>{if(host.hidden)stop();});observer.observe(host,{attributes:true,attributeFilter:['hidden']});
const resize=new ResizeObserver(()=>updateRings());resize.observe($('hw-map'));
sourceLinks();draw();inspect();$('hw-status').textContent='CPU/GPU/staging role fixtures · center is a live local geometry calculation. Tab or arrow keys select identities.';
$('hw-circle-status').textContent='Exact reference (3/5, 4/5) · radius 1 · curvature 1 / model length';
document.addEventListener('lotus:transport-event',event=>{recordedReceipt=event.detail;showRecordedReceipt();});
operatorSource={status:'Evaluation-native integrity check; source text not exposed'};

window.lotusHardware={
  setSnapshot(input){const next=validateSnapshot(input);snapshot=next;dimensions=[0,1,2];page=0;stop();$('hw-mode').textContent=next.mode.toUpperCase()+' · '+next.id;draw();inspect();},
  setSelection:select,
  getState:()=>({snapshot:structuredClone(snapshot),selection,depth,dimensions:[...dimensions],playing:frame!==null,angle}),
  getGeometryState:canonicalState,
  dispose(){disposed=true;stop();observer.disconnect();resize.disconnect();document.removeEventListener('visibilitychange',visibility);section.remove();},
};
window.lotusCanonicalCheck=()=>{
  const checks=[],check=(name,passed)=>checks.push({name,passed:Boolean(passed)});
  const original=canonicalState(),builds=geometryBuilds;
  $('hw-circle-radius').value='2';$('hw-circle-radius').dispatchEvent(new Event('change'));
  check('scale reuses reference',geometryState.reference_id===original.reference_id&&geometryBuilds===builds);
  check('scaled point and curvature',geometryState.output.point[0]===1.2&&geometryState.output.point[1]===1.6&&geometryState.output.curvature===.5);
  check('unit tangent retained',geometryState.output.tangent[0]===-.8&&geometryState.output.tangent[1]===.6);
  const valid=JSON.stringify(geometryState);$('hw-circle-radius').value='0';$('hw-circle-radius').dispatchEvent(new Event('change'));
  check('invalid scale retains state',JSON.stringify(geometryState)===valid);
  $('hw-circle-radius').value='1';$('hw-circle-radius').dispatchEvent(new Event('change'));
  $('hw-circle-step').click();check('chart stepping changes computed point',geometryState.reference.unit_point[0]===0&&geometryState.reference.unit_point[1]===1);
  $('hw-circle-p').value='1';$('hw-circle-p').dispatchEvent(new Event('change'));select('lotus');
  check('center exposes full state',$('hw-selection').textContent.includes('lotus.canonical-geometry-state/v1')&&Boolean($('hw-canonical-point')));
  check('native source hash matches',operatorSource?.hash_matches===true);
  return {passed:checks.every(c=>c.passed),checks};
};
window.lotusHardwareCheck=()=>{
  const checks=[],check=(name,value)=>checks.push({name,passed:Boolean(value)});
  check('three stable corner identities plus distinct Lotus',$('hw-map').querySelectorAll('[data-hardware]').length===4);
  $('hw-map').querySelector('[data-hardware="cpu"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));check('keyboard selects GPU',selection==='gpu');
  select('staging',2);check('nested full state visible',$('hw-selection').textContent.includes('CPU-hosted')&&depth===2&&$('hw-selection').textContent.includes('embeddings'));
  check('no invented transport',snapshot.events.length===0&&snapshot.producer_time===null);
  check('asset source links available',Boolean(manifest));check('initial display motion paused',frame===null);
  select('cpu');return {passed:checks.every(c=>c.passed),checks};
};
