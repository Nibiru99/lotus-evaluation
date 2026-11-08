const fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');
function createSelectedCrystalEvaluation(dashboard,{node=process.execPath,python=process.env.LOTUS_PYTHON||'python',timeoutMs=120000}={}){
 const lab=path.resolve(process.env.LOTUS_DATA_DIR);let state={status:'idle',key:null,summary:null,error:null},active=false,child=null,pending=Promise.resolve(),cancelled=false;
 const snapshot=()=>structuredClone(state);
 function command(exe,args,input){return new Promise((resolve,reject)=>{
  const p=spawn(exe,args,{cwd:lab,windowsHide:true,env:{...process.env,ELECTRON_RUN_AS_NODE:'1',PYTHONDONTWRITEBYTECODE:'1',PYTHONIOENCODING:'utf-8'},stdio:['pipe','pipe','pipe']});child=p;
  let out='',err='',done=false;const finish=e=>{if(done)return;done=true;clearTimeout(timer);if(child===p)child=null;e?reject(e):resolve(out);};
  const timer=setTimeout(()=>{p.kill();finish(Error('Selected evaluation timed out'));},timeoutMs);
  p.stdout.on('data',b=>{out+=b;if(out.length>65536){p.kill();finish(Error('Receipt exceeded its bound'));}});p.stderr.on('data',b=>err=(err+b).slice(-4096));
  p.on('error',finish);p.on('close',code=>finish(code===0?null:Error('Local evaluation failed: '+err)));p.stdin.on('error',()=>{});p.stdin.end(input || '');
 });}
 function start(key){
  if(!['probability','wave','word64'].includes(key))throw Error('Choose one of the three reviewed crystals');
  if(active)return snapshot();
  const run=path.join(lab,'runs','single-center-'+Date.now()+'-'+randomUUID().slice(0,8));fs.mkdirSync(run,{recursive:true});
  active=true;cancelled=false;state={status:'running',key,summary:null,error:null};
  pending=(async()=>{
   const receipt=JSON.parse(await command(path.join(dashboard,'bin/lotus-center.exe'),[],JSON.stringify({key})));if(cancelled)return;
   const file=path.join(run,'RECEIPT.json');fs.writeFileSync(file,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
   const summary=JSON.parse(await command(python,['-B',path.join(dashboard,'runtime/check_center.py'),file]));if(cancelled)return;
   if(summary.status!=='passed'||summary.key!==key)throw Error('Selected check did not pass');
   fs.writeFileSync(path.join(run,'VERIFICATION.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
   state={status:'complete',key,summary,error:null};
  })().catch(e=>{if(!cancelled){fs.writeFileSync(path.join(run,'ERROR.txt'),e.stack || e.message);state={status:'failed',key,summary:null,error:'Local evaluation failed; see the local results folder.'};}})
   .finally(()=>{active=false;fs.writeFileSync(path.join(run,'STATUS.json'),JSON.stringify(state,null,2)+'\n');});
  return snapshot();
 }
 function stop(){if(active){cancelled=true;child?.kill();state={...state,status:'stopped'};}return snapshot();}
 return {start,snapshot,stop,completion:()=>pending};
}
module.exports={createSelectedCrystalEvaluation};
