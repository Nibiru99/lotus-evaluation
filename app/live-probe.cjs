const fs=require('node:fs'),path=require('node:path');const {spawn}=require('node:child_process');
function createLiveProbe(app,{jobs=60}={}){
 let child=null,state={status:'idle',error:null,run:null,pid:null,metadata:null,events:[]},partial='';
 const snapshot=()=>({...structuredClone(state),pid:child?.pid??null});
 function start({producer='dense-reference',gpuUuid}={}){
  if(producer!=='dense-reference')throw Error('This portable edition supports the declared dense observation only');
  if(child)return snapshot();
  const data=path.resolve(process.env.LOTUS_DATA_DIR),run=path.join(data,'runs','lotus-live-'+Date.now());
  fs.mkdirSync(path.dirname(run),{recursive:true});state={status:'starting',error:null,run,metadata:null,events:[]};partial='';
  const env={...process.env,PYTHONIOENCODING:'utf-8',PYTHONDONTWRITEBYTECODE:'1'};
  if(gpuUuid){env.CUDA_VISIBLE_DEVICES=gpuUuid;env.LOTUS_GPU_UUID=gpuUuid;}
  child=spawn(process.env.LOTUS_PYTHON||'python',['-B','-u',path.join(app,'runtime/live_probe.py'),'--output',run,'--jobs',String(jobs)],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',b=>{partial+=b.toString('utf8');if(partial.length>1024*1024){state.error='Event bound exceeded';state.status='failed';child.kill();return;}
   let n;while((n=partial.indexOf('\n'))>=0){const line=partial.slice(0,n);partial=partial.slice(n+1);if(!line.trim())continue;try{
    const event=JSON.parse(line);if(event.schema!=='lotus.live-event/v1'||event.session!==path.basename(run))throw Error('Unexpected event');
    if(event.kind==='session-start')state.metadata=event;state.events.push(event);if(state.events.length>128)state.events.shift();
    state.status=event.kind==='session-end'?(event.stopped?'stopped':'complete'):event.kind==='session-error'?'failed':'running';if(event.kind==='session-error')state.error='Observed workload failed';
   }catch{state.status='failed';state.error='Invalid workload receipt';child?.kill();}}});
  child.stderr.on('data',b=>{fs.mkdirSync(run,{recursive:true});fs.appendFileSync(path.join(run,'stderr.log'),b);});
  child.on('error',()=>{state.status='failed';state.error='Python environment unavailable';child=null;});
  child.on('exit',code=>{if(code!==0){state.status='failed';state.error='Workload stopped before valid completion';}child=null;});return snapshot();
 }
 function stop(){if(child){fs.mkdirSync(state.run,{recursive:true});fs.writeFileSync(path.join(state.run,'stop.request'),'stop\n');state.status='stopping';}return snapshot();}
 function close(){child?.kill();}
 return {start,snapshot,stop,close};
}module.exports={createLiveProbe};
